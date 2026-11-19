// Web tests for income (commission, rent, interest, fees, other) and mobile money commission (19 Nov, owner: "how will mobile money commission be
// treated in terms of debit and credit? How about floats?"). A new feature, not a defect fix:
// there is no "before" screen to prove against, so this suite runs on the current app only.
const { withBrowser, suite, app, mount, text, find, tag, tick, proof, server, toasts } = require("./kit");
const KES = 0, UGX = 2;

const wallet = { id: "w1", code: "MP-1", agentName: "M-Pesa Moi Ave", agentNumber: "123456", phoneNumber: "", storeNumber: "", agentType: 0,
  provider: 0, currency: KES, balance: 0, openingBalance: 0, totalDebit: 0, totalCredit: 0, netMovement: 0, isActive: true, createdAt: "" };
const box = (tree, id) => find(tree, (e) => tag(e) === "input" && e.props.id === id)[0];
const type = (m, id, value) => { box(m.tree, id).props.onChange({ target: { value } }); m.render(); };
const recordButton = (tree) => find(tree, (e) => tag(e) === "button" && e.props.type === "submit")[0];

suite(async () => {
  const { RecordCommissionModal, CommissionPanel } = app("components/office/mpesa/sections/CommissionPanel");

  await proof("I1", "Record commission: gross 10,000, tax 1,000 → 9,000 into the wallet, booked as income gross", async (expect) => {
    server.reply((url, body, method) => (url.includes("/api/income/commission") && method === "POST" ? { gross: body.grossAmount } : undefined));
    let saved = 0;
    await withBrowser(async () => {
      const m = mount(RecordCommissionModal, { agents: [wallet], onClose() {}, onSaved: () => { saved++; } });
      type(m, "commission-gross", "10,000");
      type(m, "commission-tax", "1000");
      const shown = text(m.tree);
      expect(/KES 9,000 arrives in M-Pesa Moi Ave/.test(shown), `net shown: ${shown.slice(0, 300)}`);
      expect(/Dr M-Pesa Moi Ave KES 9,000 · Cr Commission income KES 9,000/.test(shown), "the wallet entry is not shown");
      expect(/Dr Withholding tax KES 1,000 · Cr Commission income KES 1,000/.test(shown), "the tax entry is not shown");
      expect(!recordButton(m.tree).props.disabled, "Record is disabled for a valid entry");
      await find(m.tree, (e) => tag(e) === "form")[0].props.onSubmit({ preventDefault() {} });
      for (let i = 0; i < 6; i++) { await tick(10); m.render(); }
    });
    const post = server.requests.find((r) => r.url.includes("/api/income/commission"));
    expect(!!post, "nothing was sent to /api/income/commission");
    expect(post && post.method === "POST" && post.body.grossAmount === 10000 && post.body.withholdingTax === 1000
      && post.body.destAccountType === 2 && post.body.destAccountId === "w1" && post.body.currency === KES,
      `sent: ${JSON.stringify(post && post.body)}`);
    expect(saved === 1, `onSaved called ${saved} times`);
    expect(toasts.some(([k, msg]) => k === "success" && /KES 9,000 into M-Pesa Moi Ave/.test(msg)), `toasts: ${JSON.stringify(toasts)}`);
  });

  await proof("I2", "Record commission: tax equal to the commission is refused before sending", async (expect) => {
    await withBrowser(async () => {
      const m = mount(RecordCommissionModal, { agents: [wallet], onClose() {}, onSaved() {} });
      type(m, "commission-gross", "1000");
      type(m, "commission-tax", "1000");
      expect(/Tax withheld must be less than the commission earned/.test(text(m.tree)), "no explanation shown");
      expect(recordButton(m.tree).props.disabled === true, "Record stays enabled");
      await find(m.tree, (e) => tag(e) === "form")[0].props.onSubmit({ preventDefault() {} });
      await tick(10);
    });
    expect(!server.requests.some((r) => r.url.includes("/api/income/commission")), "it was sent anyway");
  });

  await proof("I3", "Commission and float: per currency, never added across; total float = e-float + cash", async (expect) => {
    const row = (currency, o) => ({ currency, commissionGross: 0, withholdingTax: 0, commissionNet: 0, feeIncome: 0, otherIncome: 0, totalIncome: 0,
      withholdingTaxRecoverable: 0, eFloat: 0, cashOnHand: 0, ...o });
    server.reply((url) => (url.includes("/api/income/summary") ? { fromUtc: "", toUtcExclusive: "", byCurrency: [
      row(UGX, { commissionGross: 250000, withholdingTax: 25000, commissionNet: 225000, withholdingTaxRecoverable: 40000, eFloat: 3000000, cashOnHand: 2000000 }),
      row(KES, { commissionGross: 3000, withholdingTax: 300, commissionNet: 2700, withholdingTaxRecoverable: 300, eFloat: 50000, cashOnHand: 0 }),
    ] } : undefined));
    const m = mount(CommissionPanel, { agents: [wallet] });
    for (let i = 0; i < 4; i++) { await tick(10); m.render(); }
    const rows = find(m.tree, (e) => tag(e) === "tr" && e.props["data-currency"]);
    const ugx = rows.find((r) => r.props["data-currency"] === "UGX");
    const kes = rows.find((r) => r.props["data-currency"] === "KES");
    expect(!!ugx && !!kes, `rows: ${rows.map((r) => r.props["data-currency"]).join(",")}`);
    const u = ugx ? text(ugx) : "", k = kes ? text(kes) : "";
    expect(/UGX 250,000/.test(u) && /UGX 25,000/.test(u) && /UGX 225,000/.test(u) && /UGX 40,000/.test(u), `UGX row: ${u}`);
    expect(/UGX 5,000,000/.test(u), `UGX total float should be 3,000,000 + 2,000,000: ${u}`);
    expect(/KES 3,000/.test(k) && /KES 2,700/.test(k) && /KES 50,000/.test(k) && !/UGX/.test(k), `KES row: ${k}`);
    expect(/Commission is income, recorded gross/.test(text(m.tree)), "the booking rule is not explained");
  });

  // ---------- any income (20 Nov, owner: "I just wanted a way to treat other incomes")
  const { RecordIncomeModal, IncomeAccount } = app("components/office/income/IncomeAccount");
  const kinds = [{ id: "k-com", name: "Commission" }, { id: "k-rent", name: "Rent received" }, { id: "k-int", name: "Interest received" }];
  const receivers = [{ type: 0, id: "till-kes", name: "Cash till (KES)", currency: KES }, { type: 1, id: "bank-1", name: "KCB – Main", currency: KES }];
  const pick = (m, id, value) => { find(m.tree, (e) => tag(e) === "select" && e.props.id === id)[0].props.onChange({ target: { value } }); m.render(); };

  await proof("I6", "Record income: rent 40,000 with 4,000 tax into the bank → 36,000 arrives, income gross", async (expect) => {
    server.reply((url, body, method) => (/\/api\/income$/.test(url.split("?")[0]) && method === "POST" ? { ok: true } : undefined));
    let saved = 0;
    await withBrowser(async () => {
      const m = mount(RecordIncomeModal, { kinds, receivers, onClose() {}, onSaved: () => { saved++; } });
      pick(m, "income-kind", "k-rent");
      pick(m, "income-into", "1:bank-1");
      type(m, "income-amount", "40,000");
      type(m, "income-tax", "4000");
      type(m, "income-description", "Shop 3, November");
      const shown = text(m.tree);
      expect(/KES 36,000 arrives in KCB – Main/.test(shown), `shown: ${shown.slice(0, 300)}`);
      expect(/Dr KCB – Main KES 36,000 · Cr Rent received KES 36,000/.test(shown) && /Dr Withholding tax KES 4,000 · Cr Rent received KES 4,000/.test(shown), "entries not shown");
      await find(m.tree, (e) => tag(e) === "form")[0].props.onSubmit({ preventDefault() {} });
      for (let i = 0; i < 6; i++) { await tick(10); m.render(); }
    });
    const post = server.requests.find((r) => /\/api\/income$/.test(r.url.split("?")[0]) && r.method === "POST");
    expect(!!post && post.body.incomeAccountId === "k-rent" && post.body.destAccountType === 1 && post.body.destAccountId === "bank-1"
      && post.body.amount === 40000 && post.body.withholdingTax === 4000 && post.body.currency === KES && post.body.description === "Shop 3, November",
      `sent: ${JSON.stringify(post && post.body)}`);
    expect(saved === 1, `onSaved called ${saved} times`);
  });

  await proof("I7", "Income page: each kind of income per currency, tax withheld, received, tax to claim; income postings listed", async (expect) => {
    server.reply((url) => {
      if (url.includes("/api/income/summary")) return { fromUtc: "", toUtcExclusive: "", byCurrency: [{ currency: KES, commissionGross: 10000, withholdingTax: 1300, commissionNet: 9000, feeIncome: 0, otherIncome: 2000,
        totalIncome: 12000, withholdingTaxRecoverable: 1300, eFloat: 0, cashOnHand: 0, netReceived: 10700, byAccount: [
          { id: "k-com", name: "Commission", gross: 10000, withholdingTax: 1000, net: 9000 },
          { id: "k-int", name: "Interest received", gross: 2000, withholdingTax: 300, net: 1700 }] }] };
      if (url.includes("/api/transaction?")) return { items: [{ id: "t1", code: "TXN-1", description: "Interest received: October", amount: 1700, currency: KES, transactionDate: "2026-11-02T10:00:00Z",
        sourceAccountType: 5, sourceAccountName: "Interest received", destAccountType: 1, destAccountName: "KCB – Main", isReversed: false }], totalCount: 1, page: 1, pageSize: 200 };
      if (url.includes("/api/income/accounts")) return kinds;
      if (url.includes("/api/cash")) return [{ id: "till-kes", currency: KES }];
      return undefined;
    });
    await withBrowser(async () => {
      const m = mount(IncomeAccount, {});
      for (let i = 0; i < 6; i++) { await tick(10); m.render(); }
      const card = find(m.tree, (e) => e.props && e.props["data-currency"] === "KES")[0];
      const t = card ? text(card) : "";
      expect(/Commission\s*KES 10,000\s*KES 1,000\s*KES 9,000/.test(t), `commission line: ${t.slice(0, 300)}`);
      expect(/Interest received\s*KES 2,000\s*KES 300\s*KES 1,700/.test(t), "interest line missing");
      expect(/Total\s*KES 12,000\s*KES 1,300\s*KES 10,700/.test(t), "total line wrong");
      expect(/Tax to claim back \(all time\): KES 1,300/.test(t), "tax to claim missing");
      expect(/Interest received: October/.test(text(m.tree)) && /Interest received → KCB – Main/.test(text(m.tree)), "the posting is not listed");
    });
    const list = server.requests.find((r) => r.url.includes("/api/transaction?"));
    expect(!!list && /accountType=5/.test(list.url), `the list asked for: ${list && list.url}`);
  });

  await proof("I8", "Income is in the office menu, after Expenses", async (expect) => {
    const { NAV } = app("components/office-shell/helpers");
    const ids = NAV.map((n) => n.id);
    expect(ids.indexOf("income") === ids.indexOf("expenses") + 1, `menu: ${ids.join(", ")}`);
    expect(NAV.find((n) => n.id === "income")?.href === "/office/income", "wrong link");
  });
});
