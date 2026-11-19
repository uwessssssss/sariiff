// Web tests for mobile money commission (19 Nov, owner: "how will mobile money commission be
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
});
