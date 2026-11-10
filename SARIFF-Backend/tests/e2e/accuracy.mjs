// SARIFF accuracy test — does every operation move exactly the right money?
//   node tests/e2e/accuracy.mjs <api-url> <api-log> <e2e-state.json>
// Runs after e2e.mjs, in its Ugandan bureau (home currency UGX). For every operation it
// reads the affected balances before and after and compares with an amount the TEST works
// out itself (not the API's own numbers). Then every statement's closing balance must equal
// its account's balance, each statement's running balance must chain line to line, and the
// dashboard / report totals must equal the sum of the accounts. It also leaves a realistic
// bureau behind (tills, bank, wallets, rates, float, trades, expense, invoice) for the
// design review that runs next.
import { readFileSync, writeFileSync } from "node:fs";
import { client, reporter, Cur, Acc, Txn, list, round2 } from "../lib/sarif.mjs";

const BASE = process.argv[2], LOG = process.argv[3], STATE_FILE = process.argv[4];
const S = JSON.parse(readFileSync(STATE_FILE, "utf8"));
const { api, login } = client(BASE, LOG);
const { check, done } = reporter("ACCURACY");
const UGX = Cur.UGX, USD = Cur.USD;
const eq = (a, b) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 0.005;
const fmt = (n) => (typeof n === "number" ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(n));

let T; // office token
const get = async (path) => (await api("GET", path, T)).data;
const bal = {
  client: async (id, cur) => {
    const c = await get(`/api/client/${id}`);
    if (!c) return undefined;
    if (cur === Cur.KES) return c.balanceKES;
    if (cur === USD) return c.balanceUSD;
    return (c.otherBalances || []).find((b) => b.currency === cur)?.balance ?? 0;
  },
  cash: async (id) => (await get(`/api/cash/${id}`))?.balance,
  bank: async (id) => (await get(`/api/bank/${id}`))?.balance,
  wallet: async (id) => (await get(`/api/mpesa/${id}`))?.balance,
  float: async (cur) => {
    const f = await get("/api/exchange/float");
    if (!f) return undefined;
    if (cur === (f.baseCurrency ?? Cur.KES)) return f.kesBalance;
    if (cur === USD) return f.usdBalance;
    return (f.otherBalances || []).find((b) => b.currency === cur)?.balance ?? 0;
  },
};

// Run an operation and check each balance moved by exactly the expected amount.
async function op(name, action, moves) {
  const before = [];
  for (const m of moves) before.push(await m.read());
  const r = await action();
  const ok = r && (r.success === true || r.success === undefined && r.status < 300);
  check(`${name}: accepted`, ok, `${r?.status} ${r?.message || r?.text?.slice(0, 200) || ""}`);
  for (let i = 0; i < moves.length; i++) {
    const after = await moves[i].read();
    const got = round2((after ?? NaN) - (before[i] ?? NaN));
    check(`${name}: ${moves[i].label} ${moves[i].delta >= 0 ? "+" : ""}${fmt(moves[i].delta)}`, eq(got, moves[i].delta),
      `moved ${fmt(got)} (before ${fmt(before[i])}, after ${fmt(after)})`);
  }
  return r;
}
// An operation that must be REFUSED and change nothing.
async function refused(name, action, reads) {
  const before = []; for (const r of reads) before.push(await r());
  const r = await action();
  check(`${name}: refused`, r && r.success === false && r.status < 500, `${r?.status} ${r?.message}`);
  const after = []; for (const rd of reads) after.push(await rd());
  check(`${name}: nothing changed`, before.every((b, i) => eq(b, after[i])), `before ${before.map(fmt)} after ${after.map(fmt)}`);
}

const txn = (type, srcType, srcId, dstType, dstId, amount, currency, description) => ({
  transactionType: type, sourceAccountType: srcType, sourceAccountId: srcId, destAccountType: dstType, destAccountId: dstId,
  amount, currency, counterAmount: null, counterCurrency: null, description, notes: null, exchangeRate: null, paymentMethod: 0,
});

(async () => {
  console.log(`SARIFF accuracy test — ${BASE}\n`);
  T = await login(S.ugOffice);
  if (!check("Ugandan office signs in", !!T)) return done();
  const A = S.client.id, TILL = S.tillId;
  const wallets = list(await get("/api/mpesa"));
  const MTN = wallets.find((w) => w.agentNumber === "E2E-MTN-1")?.id;
  const MPESA = wallets.find((w) => w.agentNumber === "E2E-MP-1")?.id;
  check("Seed wallets found (MTN + M-Pesa)", !!MTN && !!MPESA, JSON.stringify(wallets.map((w) => w.agentNumber)));

  // ---------- new accounts open with exactly their opening balance
  // a bureau has one till per currency: use the USD till if an earlier suite made it
  let USDTILL = list(await get("/api/cash")).find((c) => c.currency === USD)?.id;
  if (!USDTILL) {
    const usdTill = await api("POST", "/api/cash", T, { currency: USD, openingBalance: 2000 });
    check("USD cash till created", usdTill.success, usdTill.message);
    USDTILL = usdTill.data?.id;
    check("USD till opens at exactly 2,000", eq(await bal.cash(USDTILL), 2000), await bal.cash(USDTILL));
  } else {
    const second = await api("POST", "/api/cash", T, { currency: USD, openingBalance: 2000 });
    check("A second USD till is refused (one till per currency)", second.success === false && second.status < 500, `${second.status} ${second.message}`);
  }
  const usdHeld = Number(await bal.cash(USDTILL)) || 0;
  const FUND = Math.min(500, Math.floor(usdHeld / 2));
  check("USD till holds enough to stock the float", FUND >= 1, `USD ${usdHeld}`);

  const bank = await api("POST", "/api/bank", T, { bankName: "Stanbic Bank", accountNumber: "9030012345678", accountName: "Test Kampala Bureau", branchCode: "KLA01", currency: UGX, openingBalance: 5000000 });
  check("UGX bank account created", bank.success, bank.message);
  const BANK = bank.data?.id;
  check("Bank opens at exactly 5,000,000", eq(await bal.bank(BANK), 5000000), await bal.bank(BANK));

  const cb = await api("POST", "/api/client", T, { fullName: "Test Brian Okello", whatsAppNumber: "+256772000444", email: null, idPassport: "CM90011223", clientType: 1, password: null, openingBalanceKES: 0, openingBalanceUSD: 0, openingBalanceHome: 250000 });
  check("Second client created with UGX opening 250,000", cb.success, cb.message);
  const B = cb.data?.id;
  check("Second client opens at exactly UGX 250,000", eq(await bal.client(B, UGX), 250000), await bal.client(B, UGX));

  // ---------- ordinary postings
  await op("Deposit UGX 70,000 (client A → till)",
    () => api("POST", "/api/transaction", T, txn(Txn.Credit, Acc.Client, A, Acc.Cash, TILL, 70000, UGX, "Accuracy deposit")),
    [{ label: "client A", read: () => bal.client(A, UGX), delta: 70000 }, { label: "till", read: () => bal.cash(TILL), delta: 70000 }]);
  await op("Withdrawal UGX 30,000 (client A ← till)",
    () => api("POST", "/api/transaction", T, txn(Txn.Debit, Acc.Client, A, Acc.Cash, TILL, 30000, UGX, "Accuracy withdrawal")),
    [{ label: "client A", read: () => bal.client(A, UGX), delta: -30000 }, { label: "till", read: () => bal.cash(TILL), delta: -30000 }]);
  await op("Till → bank UGX 50,000",
    () => api("POST", "/api/transaction", T, txn(Txn.Credit, Acc.Cash, TILL, Acc.Bank, BANK, 50000, UGX, "Banking")),
    [{ label: "till", read: () => bal.cash(TILL), delta: -50000 }, { label: "bank", read: () => bal.bank(BANK), delta: 50000 }]);
  const mtnDep = await op("Client B deposits UGX 40,000 through MTN",
    () => api("POST", "/api/transaction", T, txn(Txn.Credit, Acc.Client, B, Acc.Mpesa, MTN, 40000, UGX, "MTN deposit")),
    [{ label: "client B", read: () => bal.client(B, UGX), delta: 40000 }, { label: "MTN wallet", read: () => bal.wallet(MTN), delta: 40000 }]);
  await op("Decimal amount UGX 1,234.56 deposit",
    () => api("POST", "/api/transaction", T, txn(Txn.Credit, Acc.Client, B, Acc.Cash, TILL, 1234.56, UGX, "Decimal deposit")),
    [{ label: "client B", read: () => bal.client(B, UGX), delta: 1234.56 }, { label: "till", read: () => bal.cash(TILL), delta: 1234.56 }]);

  const tillNow = await bal.cash(TILL);
  await refused("Withdrawal larger than the till holds",
    () => api("POST", "/api/transaction", T, txn(Txn.Debit, Acc.Client, A, Acc.Cash, TILL, tillNow + 1, UGX, "Too much")),
    [() => bal.cash(TILL), () => bal.client(A, UGX)]);
  await refused("UGX into the KES M-Pesa wallet",
    () => api("POST", "/api/transaction", T, txn(Txn.Credit, Acc.Client, A, Acc.Mpesa, MPESA, 1000, UGX, "Wrong currency")),
    [() => bal.wallet(MPESA), () => bal.client(A, UGX)]);
  if (mtnDep?.data?.id) await refused("Deleting a client transaction outside the client's statement",
    () => api("DELETE", `/api/transaction/${mtnDep.data.id}`, T, { reason: "Wrong place" }), [() => bal.client(B, UGX), () => bal.wallet(MTN)]);
  await refused("Zero amount", () => api("POST", "/api/transaction", T, txn(Txn.Credit, Acc.Client, A, Acc.Cash, TILL, 0, UGX, "Zero")), [() => bal.cash(TILL)]);
  await refused("Negative amount", () => api("POST", "/api/transaction", T, txn(Txn.Credit, Acc.Client, A, Acc.Cash, TILL, -5000, UGX, "Negative")), [() => bal.cash(TILL)]);
  await refused("Same account on both sides", () => api("POST", "/api/transaction", T, txn(Txn.Credit, Acc.Cash, TILL, Acc.Cash, TILL, 1000, UGX, "Self")), [() => bal.cash(TILL)]);

  // ---------- delete = exact reversal
  if (mtnDep?.data?.id)
    await op("Reverse the MTN deposit from client B's statement",
      () => api("DELETE", `/api/client/${B}/transaction/${mtnDep.data.id}`, T, { reason: "Entered twice" }),
      [{ label: "client B", read: () => bal.client(B, UGX), delta: -40000 }, { label: "MTN wallet", read: () => bal.wallet(MTN), delta: -40000 }]);

  // ---------- expense and its reversal
  const cat = await api("POST", "/api/expense/category", T, { name: "Office Rent", description: "Monthly rent" });
  check("Expense category created", cat.success, cat.message);
  const exp = await op("Expense UGX 20,000 paid from the till",
    () => api("POST", "/api/expense", T, { categoryId: cat.data?.id, description: "November rent", vendorPayee: "Kampala Properties", amount: 20000, currency: UGX, paymentMethod: 0, paymentAccountType: Acc.Cash, paymentAccountId: TILL, reference: "RENT-11", expenseDate: new Date().toISOString() }),
    [{ label: "till", read: () => bal.cash(TILL), delta: -20000 }]);
  const exp2 = await api("POST", "/api/expense", T, { categoryId: cat.data?.id, description: "Generator fuel", vendorPayee: "Shell Kampala", amount: 85000, currency: UGX, paymentMethod: 1, paymentAccountType: Acc.Bank, paymentAccountId: BANK, reference: "FUEL-3", expenseDate: new Date().toISOString() });
  check("Second expense (from bank) accepted", exp2.success, exp2.message);
  if (exp?.data?.id)
    await op("Delete the rent expense (reversal)", () => api("DELETE", `/api/expense/${exp.data.id}`, T),
      [{ label: "till", read: () => bal.cash(TILL), delta: 20000 }]);
  await refused("Expense larger than the account holds",
    () => api("POST", "/api/expense", T, { categoryId: cat.data?.id, description: "Too big", vendorPayee: null, amount: 999999999, currency: UGX, paymentMethod: 0, paymentAccountType: Acc.Cash, paymentAccountId: TILL, reference: null, expenseDate: new Date().toISOString() }),
    [() => bal.cash(TILL)]);

  // ---------- exchange: rates, float, trades, rounding, void
  for (const [cur, buy, sell] of [[USD, 3650, 3700], [Cur.KES, 27.5, 28.5], [Cur.EUR, 3950, 4050]]) {
    const r = await api("POST", "/api/exchange/rate", T, { buyRate: buy, sellRate: sell, foreignCurrency: cur });
    check(`Rate set for ${Object.keys(Cur)[cur]} (${buy}/${sell})`, r.success, r.message);
  }
  const rate = await api("GET", `/api/exchange/rate?currency=${USD}`, T);
  check("USD rate reads back exactly 3650 / 3700", eq(rate.data?.buyRate, 3650) && eq(rate.data?.sellRate, 3700), JSON.stringify(rate.data));

  await op("Fund float UGX 3,000,000 from the bank",
    () => api("POST", "/api/exchange/float/fund", T, { currency: UGX, amount: 3000000, sourceType: Acc.Bank, sourceAccountId: BANK, purchaseRate: null, notes: "Opening float" }),
    [{ label: "bank", read: () => bal.bank(BANK), delta: -3000000 }, { label: "float UGX", read: () => bal.float(UGX), delta: 3000000 }]);
  await op(`Fund float USD ${FUND} from the USD till`,
    () => api("POST", "/api/exchange/float/fund", T, { currency: USD, amount: FUND, sourceType: Acc.Cash, sourceAccountId: USDTILL, purchaseRate: 3640, notes: "USD stock" }),
    [{ label: "USD till", read: () => bal.cash(USDTILL), delta: -FUND }, { label: "float USD", read: () => bal.float(USD), delta: FUND }]);

  const ex = (body) => api("POST", "/api/exchange/transaction", T, { clientId: null, customRate: null, clientIdNumber: null, notes: null, foreignCurrency: USD, ...body });
  const buy = await op("Bureau BUYS USD 100 cash at 3,650",
    () => ex({ exchangeType: 0, direction: 0, amount: 100, clientName: "Walk In Customer" }),
    [{ label: "float USD", read: () => bal.float(USD), delta: 100 }, { label: "float UGX", read: () => bal.float(UGX), delta: -365000 }]);
  check("…customer receives exactly UGX 365,000", eq(buy?.data?.amountReceived, 365000), JSON.stringify(buy?.data && { given: buy.data.amountGiven, received: buy.data.amountReceived, rate: buy.data.exchangeRate }));
  await op("Bureau SELLS USD 50 cash at 3,700 (customer gives UGX 185,000)",
    () => ex({ exchangeType: 0, direction: 1, amount: 185000, clientName: "Walk In Customer" }),
    [{ label: "float UGX", read: () => bal.float(UGX), delta: 185000 }, { label: "float USD", read: () => bal.float(USD), delta: -50 }]);
  const odd = await op("Rounding: buy USD 33.33 at 3,650 = UGX 121,654.50",
    () => ex({ exchangeType: 0, direction: 0, amount: 33.33, clientName: "Walk In Customer" }),
    [{ label: "float USD", read: () => bal.float(USD), delta: 33.33 }, { label: "float UGX", read: () => bal.float(UGX), delta: -121654.5 }]);
  check("…customer receives exactly UGX 121,654.50", eq(odd?.data?.amountReceived, 121654.5), odd?.data?.amountReceived);
  const fx = await op("Client A converts UGX 37,000 → USD 10 from his account",
    () => ex({ clientId: A, exchangeType: 1, direction: 1, amount: 37000 }),
    [{ label: "client A UGX", read: () => bal.client(A, UGX), delta: -37000 }, { label: "client A USD", read: () => bal.client(A, USD), delta: 10 },
     { label: "float UGX", read: () => bal.float(UGX), delta: 37000 }, { label: "float USD", read: () => bal.float(USD), delta: -10 }]);
  if (fx?.data?.id)
    await op("Void that exchange (exact reversal)", () => api("POST", `/api/exchange/transaction/${fx.data.id}/void`, T, { reason: "Customer changed mind" }),
      [{ label: "client A UGX", read: () => bal.client(A, UGX), delta: 37000 }, { label: "client A USD", read: () => bal.client(A, USD), delta: -10 },
       { label: "float UGX", read: () => bal.float(UGX), delta: -37000 }, { label: "float USD", read: () => bal.float(USD), delta: 10 }]);
  const fUsd = await bal.float(USD);
  await refused("Selling more USD than the float holds",
    () => ex({ exchangeType: 0, direction: 1, amount: round2((fUsd + 100) * 3700), clientName: "Walk In Customer" }),
    [() => bal.float(USD), () => bal.float(UGX)]);
  await refused("Exchange from an account without enough money",
    () => ex({ clientId: B, exchangeType: 1, direction: 1, amount: 999999999 }), [() => bal.client(B, UGX), () => bal.float(UGX)]);
  await refused("Exchange with the home currency as the 'foreign' side",
    () => ex({ exchangeType: 0, direction: 0, amount: 1000, clientName: "Walk In Customer", foreignCurrency: UGX }), [() => bal.float(UGX)]);

  // ---------- invoice arithmetic (worked out here)
  const items = [{ description: "Currency consultancy", quantity: 2, unitPrice: 150000 }, { description: "Courier", quantity: 3, unitPrice: 12500.5 }];
  const sub = round2(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)); // 337,501.50
  const tax = round2(sub * 0.18), disc = 10000, total = round2(sub + tax - disc);
  const due = new Date(Date.now() + 14 * 864e5).toISOString();
  const inv = await api("POST", "/api/invoice", T, { clientId: A, clientName: "Test Amina", clientEmail: null, clientPhone: S.client.phone, clientAddress: "Kampala", dueDate: due, currency: UGX, items, taxRate: 18, discountAmount: disc, notes: "Thank you", terms: "Pay within 14 days" });
  check("Invoice created", inv.success, inv.message);
  check(`Invoice subtotal ${fmt(sub)}, tax ${fmt(tax)}, total ${fmt(total)}`,
    eq(inv.data?.subtotal, sub) && eq(inv.data?.taxAmount, tax) && eq(inv.data?.total, total),
    JSON.stringify({ subtotal: inv.data?.subtotal, tax: inv.data?.taxAmount, total: inv.data?.total }));
  check("Invoice total = subtotal + tax − discount exactly", eq(inv.data?.total, round2(inv.data?.subtotal + inv.data?.taxAmount - inv.data?.discountAmount)), JSON.stringify(inv.data));

  // ---------- reconciliation
  const tillBal = await bal.cash(TILL);
  const rec = await api("POST", "/api/reconciliation", T, { accountType: Acc.Cash, accountId: TILL, actualBalance: tillBal - 2500, notes: "Counted at close" });
  check("Reconciliation created", rec.success, rec.message);
  check("Reconciliation expected balance = the till's balance", eq(rec.data?.expectedBalance, tillBal), `${rec.data?.expectedBalance} vs ${tillBal}`);
  check("Reconciliation variance = counted − expected = −2,500", eq(rec.data?.variance, -2500), rec.data?.variance);

  // ---------- statements: closing = balance, running balance chains, opening + movement = closing
  async function statement(label, path, current) {
    const st = await get(path);
    if (!check(`${label} statement loads`, !!st, path)) return;
    check(`${label} statement closing = account balance (${fmt(current)})`, eq(st.closingBalance, current), `closing ${fmt(st.closingBalance)}`);
    const lines = [...(st.transactions || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
    let chain = true, where = "";
    for (let i = 1; i < lines.length; i++)
      if (!eq(lines[i].balanceBefore, lines[i - 1].balanceAfter)) { chain = false; where = `line ${i}: before ${lines[i].balanceBefore} ≠ previous after ${lines[i - 1].balanceAfter}`; break; }
    check(`${label} statement running balance chains line to line (${lines.length} lines)`, chain, where);
    if (lines.length) check(`${label} statement: last line's balance = closing`, eq(lines.at(-1).balanceAfter, st.closingBalance), `${lines.at(-1).balanceAfter} vs ${st.closingBalance}`);
    check(`${label} statement: opening + money in − money out = closing`,
      eq(round2(st.openingBalance + (st.netMovement ?? 0)), st.closingBalance),
      `opening ${st.openingBalance} + net ${st.netMovement} vs closing ${st.closingBalance}`);
  }
  await statement("Client A (UGX)", `/api/client/${A}/statement?currency=${UGX}`, await bal.client(A, UGX));
  await statement("Client B (UGX)", `/api/client/${B}/statement?currency=${UGX}`, await bal.client(B, UGX));
  await statement("UGX till", `/api/cash/statement/${UGX}`, await bal.cash(TILL));
  await statement("USD till", `/api/cash/statement/${USD}`, await bal.cash(USDTILL));
  await statement("Bank", `/api/bank/${BANK}/statement`, await bal.bank(BANK));
  await statement("MTN wallet", `/api/mpesa/${MTN}/statement`, await bal.wallet(MTN));

  // ---------- totals on the dashboard and reports = sum of the accounts
  const tills = list(await get("/api/cash"));
  const banks = list(await get("/api/bank"));
  const dash = await get("/api/dashboard");
  const sumOf = (rows, cur) => round2(rows.filter((t) => t.currency === cur).reduce((s, t) => s + t.balance, 0));
  for (const cur of [UGX, USD]) {
    const row = (dash?.byCurrency || []).find((c) => c.currency === cur);
    const code = Object.keys(Cur)[cur];
    check(`Dashboard ${code} cash = sum of ${code} tills (${fmt(sumOf(tills, cur))})`, eq(row?.cash, sumOf(tills, cur)), `dashboard shows ${fmt(row?.cash)}`);
    check(`Dashboard ${code} bank = sum of ${code} banks (${fmt(sumOf(banks, cur))})`, eq(row?.bank ?? 0, sumOf(banks, cur)), `dashboard shows ${fmt(row?.bank)}`);
  }
  const mm = dash?.mobileMoneyByCurrency || [];
  const mtnBal = await bal.wallet(MTN), mpBal = await bal.wallet(MPESA);
  check(`Dashboard mobile money UGX = MTN wallet (${fmt(mtnBal)})`, eq(mm.find((x) => x.currency === UGX)?.amount, mtnBal), JSON.stringify(mm));
  check(`Dashboard mobile money KES = M-Pesa wallet (${fmt(mpBal)})`, eq(mm.find((x) => x.currency === Cur.KES)?.amount, mpBal), JSON.stringify(mm));
  check("Dashboard 'Total M-Pesa' counts only home-currency (UGX) wallets", eq(dash?.totalMpesa, mtnBal), `totalMpesa ${dash?.totalMpesa}, MTN ${mtnBal}, M-Pesa(KES) ${mpBal}`);

  const rep = await api("GET", "/api/report/client-balances", T);
  check("Client balances report loads", rep.success, rep.message);
  const clients = list(await get("/api/client?page=1&pageSize=100"));
  let owedTo = 0, owedBy = 0;
  for (const c of clients) { const b = (c.otherBalances || []).find((x) => x.currency === UGX)?.balance ?? 0; if (b > 0) owedTo += b; else owedBy -= b; }
  const ru = (rep.data?.byCurrency || []).find((x) => x.currency === UGX);
  check(`Client balances report: UGX owed to clients = ${fmt(round2(owedTo))}`, eq(ru?.totalCredit, round2(owedTo)), JSON.stringify(ru));
  check(`Client balances report: UGX owed by clients = ${fmt(round2(owedBy))}`, eq(ru?.totalDebit ?? 0, round2(owedBy)), JSON.stringify(ru));

  writeFileSync(STATE_FILE, JSON.stringify({ ...S, usdTillId: USDTILL, bankId: BANK, clientB: B, invoiceId: inv.data?.id }, null, 2));
  done();
})().catch((e) => { check("accuracy test crashed", false, e.stack); done(); });
