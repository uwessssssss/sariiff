// SARIFF end-to-end test against a RUNNING API (fresh Development database).
//   node tests/e2e/e2e.mjs <api-base-url> <api-log-file>
// It signs in like the apps do (SMS codes are read from the API log, as Development
// prints them instead of sending), then checks money, currencies, times and phone login.
import { readFileSync, writeFileSync } from "node:fs";
// Optional: E2E_STATE=<file> saves the codes it created, for the browser and app tests.
const state = {};

const BASE = process.argv[2] || "http://127.0.0.1:18080";
const LOG = process.argv[3] || "/tmp/sariff-e2e-api.log";
const EAT = 3 * 3600 * 1000;
const todayEAT = () => new Date(Date.now() + EAT).toISOString().slice(0, 10);
const hhmmEAT = (ms = Date.now()) => new Date(ms + EAT).toISOString().slice(11, 16);
const KES = 0, UGX = 2, Credit = 1, Cash = 0, Mpesa = 2, Client = 3;

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail = "") {
  ok ? pass++ : fail++;
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n        ${detail}`}`);
  console.log(results[results.length - 1]);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, token, body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (method !== "GET") headers["Idempotency-Key"] = crypto.randomUUID();
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, ...(json || {}) };
}

// The newest 6-digit code the API "sent" to this phone, after `afterLen` bytes of log.
async function codeFor(phone, afterLen) {
  const esc = phone.replace(/[+]/g, "\\+");
  const re = new RegExp(`Message to "?${esc}"?: "?Sarif: Your verification code is (\\d{6})`, "g");
  for (let i = 0; i < 40; i++) {
    const text = readFileSync(LOG, "utf8").slice(afterLen);
    const all = [...text.matchAll(re)];
    if (all.length) return all[all.length - 1][1];
    await sleep(250);
  }
  return null;
}
const logLen = () => readFileSync(LOG, "utf8").length;

async function officeLogin(code, phone, password) {
  const mark = logLen();
  const r = await api("POST", "/api/auth/login", null, { code, phoneNumber: phone, password });
  if (!r.success) return { error: r.message || `HTTP ${r.status}` };
  if (r.data?.accessToken) return { token: r.data.accessToken, data: r.data };
  const otp = await codeFor(phone, mark);
  if (!otp) return { error: "no SMS code found in the API log" };
  const v = await api("POST", "/api/auth/verify-otp", null, { code, phoneNumber: phone, otp });
  return v.success ? { token: v.data.accessToken, data: v.data } : { error: v.message };
}

const list = (d) => (Array.isArray(d) ? d : d?.items || d?.Items || []);

(async () => {
  console.log(`SARIFF end-to-end test — ${BASE}\n`);

  // ---------- 1. API up
  const h = await fetch(BASE + "/health").then((r) => r.status).catch(() => 0);
  check("API answers /health", h === 200, `status ${h}`);
  if (h !== 200) return finish();

  // ---------- 2. Sign-ins (office users need the SMS code)
  const ke = await officeLogin("AFB-2026-0001", "+254711111111", "Test@123");
  check("Kenyan office signs in with SMS code", !!ke.token, ke.error);
  const sa = await officeLogin("SA-2026-001", "+254700000000", "Test@123");
  check("Super admin signs in with SMS code", !!sa.token, sa.error);
  if (!ke.token || !sa.token) return finish();

  const wrong = await api("POST", "/api/auth/login", null, { code: "AFB-2026-0001", phoneNumber: "+254711111111", password: "wrong-password" });
  check("Wrong password is refused", wrong.success === false);

  // ---------- 3. A Ugandan bureau (home currency UGX)
  const ugPhone = "+256700100200", ugPass = "E2E-Bureau#2026";
  const co = await api("POST", "/api/company", sa.token, {
    name: "Test Kampala Bureau", ownerName: "Test Owner", whatsAppNumber: ugPhone, email: null, password: ugPass, baseCurrency: UGX,
  });
  check("Super admin creates a Ugandan (UGX) bureau", co.success && !!co.data?.code, co.message);
  if (co.success) state.ugOffice = { code: co.data.code, phone: ugPhone, password: ugPass, companyId: co.data.id };
  const ug = co.success ? await officeLogin(co.data.code, ugPhone, ugPass) : {};
  check("Ugandan office signs in", !!ug.token, ug.error);
  if (!ug.token) return finish();

  // ---------- 4. Mobile money wallets follow their network
  const mpesa = await api("POST", "/api/mpesa", ug.token, { agentName: "Test Mpesa Agent", phoneNumber: "+254722000111", agentNumber: "E2E-MP-1", storeNumber: null, agentType: 0, openingBalance: 50000, provider: 0 });
  check("M-Pesa wallet in a Ugandan bureau holds KES", mpesa.success && mpesa.data?.currency === KES, `got ${JSON.stringify(mpesa.data?.currency)} ${mpesa.message || ""}`);
  const mtn = await api("POST", "/api/mpesa", ug.token, { agentName: "Test Mtn Agent", phoneNumber: "+256772000111", agentNumber: "E2E-MTN-1", storeNumber: null, agentType: 0, openingBalance: 2000000, provider: 1 });
  check("MTN MoMo wallet holds UGX", mtn.success && mtn.data?.currency === UGX, `got ${JSON.stringify(mtn.data?.currency)} ${mtn.message || ""}`);
  const keMtn = await api("POST", "/api/mpesa", ke.token, { agentName: "Test Mtn Kenya", phoneNumber: "+254722000999", agentNumber: "E2E-MTN-KE", storeNumber: null, agentType: 0, openingBalance: 0, provider: 1 });
  check("A Kenyan bureau cannot open a UGX (MTN) wallet", keMtn.success === false, keMtn.message);

  const dash = await api("GET", "/api/dashboard", ug.token);
  const wallets = Object.fromEntries((dash.data?.mobileMoneyByCurrency || []).map((w) => [w.currency, w.amount]));
  check("Dashboard keeps wallets apart: UGX 2,000,000", wallets[UGX] === 2000000, JSON.stringify(dash.data?.mobileMoneyByCurrency));
  check("Dashboard keeps wallets apart: KES 50,000", wallets[KES] === 50000, JSON.stringify(dash.data?.mobileMoneyByCurrency));
  check("Home-currency mobile money total is UGX only (not 2,050,000)", dash.data?.totalMpesa === 2000000, `totalMpesa ${dash.data?.totalMpesa}`);

  // ---------- 5. UGX cash till
  let cash = await api("POST", "/api/cash", ug.token, { currency: UGX, openingBalance: 10000000 });
  let till = cash.success ? cash.data : list((await api("GET", "/api/cash", ug.token)).data).find((c) => c.currency === UGX);
  check("UGX cash till exists", !!till?.id, cash.message);
  const tillBefore = till?.balance ?? 0;

  // ---------- 6. Client with a UGX opening balance
  const P = "+256772000333", cPass = "Client#2026x";
  const cl = await api("POST", "/api/client", ug.token, { fullName: "Test Amina", whatsAppNumber: P, email: null, idPassport: null, clientType: 0, password: cPass, openingBalanceKES: 0, openingBalanceUSD: 0, openingBalanceHome: 500000 });
  const ugxBal = (c) => (c?.otherBalances || []).find((b) => b.currency === UGX)?.balance;
  check("New client gets a UGX opening balance of 500,000", cl.success && ugxBal(cl.data) === 500000, `${cl.message || ""} other=${JSON.stringify(cl.data?.otherBalances)}`);
  if (cl.success) state.client = { code: cl.data.code, phone: P, password: cPass, name: "Test Amina", id: cl.data.id };
  if (till?.id) state.tillId = till.id;
  state.ugOffice.token = ug.token;
  if (!cl.success || !till?.id) return finish();

  // ---------- 7. A real deposit: client brings UGX 100,000 in cash
  const before = Date.now();
  const tx = await api("POST", "/api/transaction", ug.token, {
    transactionType: Credit, sourceAccountType: Client, sourceAccountId: cl.data.id, destAccountType: Cash, destAccountId: till.id,
    amount: 100000, currency: UGX, counterAmount: null, counterCurrency: null, description: "E2E deposit", notes: null, exchangeRate: null, paymentMethod: 0,
  });
  check("Deposit posts", tx.success, tx.message);
  const clAfter = await api("GET", `/api/client/${cl.data.id}`, ug.token);
  check("Client balance goes 500,000 → 600,000 UGX (credit raises a client)", ugxBal(clAfter.data) === 600000, `got ${ugxBal(clAfter.data)}`);
  const tillAfter = list((await api("GET", "/api/cash", ug.token)).data).find((c) => c.id === till.id);
  check("Cash till goes up by exactly 100,000 UGX (debit raises an asset)", tillAfter?.balance === tillBefore + 100000, `before ${tillBefore}, after ${tillAfter?.balance}`);
  const txDate = tx.data?.transactionDate || tx.data?.date || tx.data?.createdAt;
  state.depositAt = txDate;
  check("API sends the time marked as UTC (ends in Z)", typeof txDate === "string" && txDate.endsWith("Z"), `got ${txDate}`);
  check("…and it is the real time (within 2 minutes)", txDate && Math.abs(Date.parse(txDate) - before) < 120000, `got ${txDate}`);

  // ---------- 8. Wrong-currency wallet is refused
  const bad = await api("POST", "/api/transaction", ug.token, {
    transactionType: Credit, sourceAccountType: Client, sourceAccountId: cl.data.id, destAccountType: Mpesa, destAccountId: mpesa.data?.id,
    amount: 1000, currency: UGX, counterAmount: null, counterCurrency: null, description: "E2E wrong wallet", notes: null, exchangeRate: null, paymentMethod: 2,
  });
  check("UGX cannot be posted into the KES M-Pesa wallet", bad.success === false, bad.message);

  // ---------- 9. "Today" filter on the bureau's day includes the deposit
  const day = todayEAT();
  const listed = await api("GET", `/api/transaction?page=1&pageSize=50&startDate=${day}&endDate=${day}`, ug.token);
  check(`Transactions for today (${day}, Nairobi/Kampala) include the deposit`, list(listed.data).some((t) => t.description === "E2E deposit"), listed.message);

  // ---------- 10. Client portal (classic sign-in)
  const cLogin = await api("POST", "/api/auth/login", null, { code: cl.data.code, phoneNumber: P, password: cPass });
  const cTok = cLogin.data?.accessToken;
  check("Client signs in to the portal", !!cTok, cLogin.message);
  if (cTok) {
    const pt = await api("GET", "/api/portal/transactions?page=1&pageSize=10", cTok);
    const mine = list(pt.data).find((t) => t.description === "E2E deposit");
    check("Client sees the deposit", !!mine, pt.message);
    const want = hhmmEAT(before), wantNext = hhmmEAT(before + 60000);
    check(`Portal shows the bureau's local time (${want}), not UTC`, mine && (mine.time === want || mine.time === wantNext), `got ${mine?.time}`);
  }

  // ---------- 11. Phone login across two bureaus
  const en = await api("GET", "/api/identity/enabled");
  check("Phone login is switched on in Development", en.data?.enabled === true, JSON.stringify(en.data));
  if (en.data?.enabled) {
    const kc = await api("POST", "/api/client", ke.token, { fullName: "Test Amina", whatsAppNumber: P, email: null, idPassport: null, clientType: 0, password: cPass });
    check("Same person is also a client at the Kenyan bureau", kc.success, kc.message);
    if (kc.success) state.clientKe = { code: kc.data.code };
    const mark = logLen();
    await api("POST", "/api/identity/request-code", null, { phone: P });
    const otp = await codeFor(P, mark);
    check("Phone login sends an SMS code", !!otp);
    const v = otp ? await api("POST", "/api/identity/verify-code", null, { phone: P, code: otp }) : {};
    const idTok = v.data?.accessToken;
    check("Code is accepted; no bureau is linked by the number alone", !!idTok && (v.data?.bureaus || []).length === 0, v.message);
    if (idTok) {
      const wrongPw = await api("POST", "/api/identity/link", idTok, { clientCode: cl.data.code, password: "nope" });
      check("Linking with a wrong password is refused", wrongPw.success === false);
      const l1 = await api("POST", "/api/identity/link", idTok, { clientCode: cl.data.code, password: cPass });
      const l2 = kc.success ? await api("POST", "/api/identity/link", idTok, { clientCode: kc.data.code, password: cPass }) : {};
      check("Both bureaus link with their own code + password", l1.success && l2.success, `${l1.message || ""} ${l2.message || ""}`);
      const b = await api("GET", "/api/identity/bureaus", idTok);
      check("The phone now lists 2 bureaus", (b.data || []).length === 2, JSON.stringify(b.data));
      const sel = await api("POST", "/api/identity/select", idTok, { companyId: co.data.id });
      check("Picking the Ugandan bureau gives that bureau's client session", sel.success && sel.data?.companyId === co.data.id, sel.message);
      const fence = await api("GET", "/api/portal/profile", idTok);
      check("The phone-only token cannot open portal data (403)", fence.status === 403, `status ${fence.status}`);
    }
  }
  finish();
})().catch((e) => { check("test run crashed", false, e.stack); finish(); });

function finish() {
  if (process.env.E2E_STATE) writeFileSync(process.env.E2E_STATE, JSON.stringify(state, null, 2));
  console.log(`\nEND-TO-END: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
