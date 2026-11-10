// SARIFF security test — attacks a live API the way an outsider, a client or another bureau would.
//   node tests/e2e/security.mjs <api-url> <api-log> <e2e-state.json> [web-url]
// Runs after e2e.mjs + accuracy.mjs (needs the Ugandan bureau they create). Creates its own
// "Test Security Bureau" for the lockout / brute-force parts so other tests' accounts stay usable.
import { readFileSync } from "node:fs";
import { client, reporter, Cur, Acc, Txn, list, sleep } from "../lib/sarif.mjs";

const BASE = process.argv[2], LOG = process.argv[3], S = JSON.parse(readFileSync(process.argv[4], "utf8")), WEB = process.argv[5];
const { api, login, codeFor } = client(BASE, LOG);
const { check, done } = reporter("SECURITY");
const refusedStatus = (r) => [401, 403, 404].includes(r.status) || (r.status === 400 && r.success === false);
const noLeak = (r, ...needles) => !needles.some((n) => n && (r.text || "").includes(n));
const txn = (type, srcType, srcId, dstType, dstId, amount, currency, description) => ({
  transactionType: type, sourceAccountType: srcType, sourceAccountId: srcId, destAccountType: dstType, destAccountId: dstId,
  amount, currency, counterAmount: null, counterCurrency: null, description, notes: null, exchangeRate: null, paymentMethod: 0,
});
// The API allows 10 sign-ins a minute per address; this test runs from one address.
let loginsThisMinute = 0, minuteStart = Date.now();
async function paced(fn) {
  if (Date.now() - minuteStart > 61000) { loginsThisMinute = 0; minuteStart = Date.now(); }
  if (loginsThisMinute >= 7) { await sleep(62000 - (Date.now() - minuteStart)); loginsThisMinute = 0; minuteStart = Date.now(); }
  loginsThisMinute++;
  return fn();
}

(async () => {
  console.log(`SARIFF security test — ${BASE}\n`);
  const UG = await paced(() => login(S.ugOffice));
  const KE = await paced(() => login({ code: "AFB-2026-0001", phone: "+254711111111", password: "Test@123" }));
  const SA = await paced(() => login({ code: "SA-2026-001", phone: "+254700000000", password: "Test@123" }));
  const CL = (await api("POST", "/api/auth/login", null, { code: S.client.code, phoneNumber: S.client.phone, password: S.client.password })).data?.accessToken;
  loginsThisMinute++;
  if (!check("All four roles sign in (UG office, KE office, super admin, client)", UG && KE && SA && CL)) return done();

  // ---------- 1. no token / forged token
  const protectedPaths = ["/api/client", "/api/transaction", "/api/dashboard", "/api/cash", "/api/bank", "/api/mpesa", "/api/expense", "/api/invoice", "/api/report/daily", "/api/admin/dashboard", "/api/admin/companies", "/api/portal/dashboard", "/api/portal/statement", "/api/exchange/float", "/api/reconciliation"];
  const anon = [];
  for (const p of protectedPaths) { const r = await api("GET", p, null); if (r.status !== 401) anon.push(`${p} → ${r.status}`); }
  check(`No token → 401 on all ${protectedPaths.length} protected endpoints`, anon.length === 0, anon.join(", "));
  const [h, p, sig] = UG.split(".");
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());
  const roleKey = Object.keys(payload).find((k) => /\/role$/.test(k)) || "role";
  const forged = `${h}.${Buffer.from(JSON.stringify({ ...payload, [roleKey]: "SuperAdmin" })).toString("base64url")}.${sig}`;
  check("Token edited to say SuperAdmin (same signature) → refused", (await api("GET", "/api/admin/companies", forged)).status === 401);
  const none = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ ...payload, [roleKey]: "SuperAdmin" })).toString("base64url")}.`;
  check("Unsigned token (alg: none) → refused", (await api("GET", "/api/admin/companies", none)).status === 401);
  const expired = `${h}.${Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) - 60 })).toString("base64url")}.${sig}`;
  check("Token with its expiry moved (signature no longer matches) → refused", (await api("GET", "/api/dashboard", expired)).status === 401);

  // ---------- 2. role fences
  const officeOnly = ["/api/client", "/api/transaction", "/api/dashboard", "/api/cash", "/api/report/client-balances", "/api/exchange/float"];
  const clientLeak = []; for (const q of officeOnly) { const r = await api("GET", q, CL); if (![401, 403].includes(r.status)) clientLeak.push(`${q} → ${r.status}`); }
  check(`Client token refused on ${officeOnly.length} office endpoints`, clientLeak.length === 0, clientLeak.join(", "));
  const adminOnly = ["/api/admin/dashboard", "/api/admin/companies", "/api/admin/audit-logs", "/api/admin/security/overview", "/api/admin/financials/overview", "/api/company"];
  const officeLeak = []; for (const q of adminOnly) { const r = await api("GET", q, UG); if (![401, 403].includes(r.status)) officeLeak.push(`${q} → ${r.status}`); }
  check(`Office token refused on ${adminOnly.length} super-admin endpoints`, officeLeak.length === 0, officeLeak.join(", "));
  const cAdmin = []; for (const q of adminOnly) { const r = await api("GET", q, CL); if (![401, 403].includes(r.status)) cAdmin.push(`${q} → ${r.status}`); }
  check("Client token refused on super-admin endpoints", cAdmin.length === 0, cAdmin.join(", "));
  const mk = await api("POST", "/api/company", UG, { name: "Rogue Bureau", ownerName: "X", whatsAppNumber: "+254700999111", email: null, password: "Rogue#2026xx", baseCurrency: 0 });
  check("Office user cannot create a bureau", [401, 403].includes(mk.status), `${mk.status} ${mk.message}`);

  // ---------- 3. one bureau cannot touch another's data (Kenyan office vs Ugandan ids)
  const wallets = list((await api("GET", "/api/mpesa", UG)).data);
  const MTN = wallets.find((w) => w.agentNumber === "E2E-MTN-1")?.id;
  const ugTx = list((await api("GET", "/api/transaction?page=1&pageSize=50", UG)).data);
  const someTx = ugTx[0]?.id, bTx = ugTx.find((t) => t.description === "Decimal deposit")?.id;
  const targets = [
    ["client", `/api/client/${S.client.id}`], ["client statement", `/api/client/${S.client.id}/statement`],
    ["cash till", `/api/cash/${S.tillId}`], ["bank account", `/api/bank/${S.bankId}`], ["bank statement", `/api/bank/${S.bankId}/statement`],
    ["wallet", `/api/mpesa/${MTN}`], ["wallet statement", `/api/mpesa/${MTN}/statement`], ["transaction", `/api/transaction/${someTx}`],
    ["invoice", `/api/invoice/${S.invoiceId}`], ["invoice PDF", `/api/invoice/${S.invoiceId}/pdf`],
  ];
  for (const [name, path] of targets) {
    if (path.includes("undefined")) { check(`Kenyan office cannot read the Ugandan ${name}`, false, "id missing from earlier tests"); continue; }
    const r = await api("GET", path, KE);
    check(`Kenyan office cannot read the Ugandan ${name}`, refusedStatus(r) && noLeak(r, "Test Amina", "Test Brian", "Stanbic", "Test Kampala"), `${r.status} ${(r.text || "").slice(0, 160)}`);
  }
  // ("Test Amina" is deliberately a client at BOTH bureaus — the phone-login test — so compare ids.)
  const keClients = await api("GET", "/api/client?page=1&pageSize=200", KE);
  const ugIds = [S.client.id, S.clientB].filter(Boolean);
  check("Kenyan client list contains none of the Ugandan bureau's clients (by id)", keClients.status === 200 && noLeak(keClients, ...ugIds, "Test Brian"), ugIds.filter((i) => (keClients.text || "").includes(i)).join(", ") || "Test Brian found");
  const before = (await api("GET", `/api/client/${S.client.id}`, UG)).data;
  const steal = await api("POST", "/api/transaction", KE, txn(Txn.Debit, Acc.Client, S.client.id, Acc.Cash, S.tillId, 1000, Cur.UGX, "Cross-bureau"));
  const after = (await api("GET", `/api/client/${S.client.id}`, UG)).data;
  check("Kenyan office cannot post to a Ugandan client and till", steal.success !== true && JSON.stringify(before?.otherBalances) === JSON.stringify(after?.otherBalances), `${steal.status} ${steal.message}`);
  if (someTx) {
    const countUg = async () => (await api("GET", "/api/transaction?page=1&pageSize=1", UG)).data?.totalCount;
    const n0 = await countUg();
    const r = await api("DELETE", `/api/transaction/${someTx}`, KE, { reason: "cross-bureau" });
    const still = (await api("GET", `/api/transaction/${someTx}`, UG)).status === 200;
    check("Kenyan office cannot delete a Ugandan transaction", r.success !== true && still && (await countUg()) === n0, `${r.status} ${r.message}`);
  }
  const aTx = ugTx.find((t) => t.description === "Accuracy deposit")?.id;
  if (aTx) {
    const ugxOf = async () => ((await api("GET", `/api/client/${S.client.id}`, UG)).data?.otherBalances || []).find((b) => b.currency === Cur.UGX)?.balance;
    const b0 = await ugxOf();
    const r = await api("DELETE", `/api/client/${S.client.id}/transaction/${aTx}`, KE, { reason: "cross-bureau" });
    const b1 = await ugxOf();
    check("Kenyan office cannot reverse a Ugandan client's transaction", refusedStatus(r) && typeof b0 === "number" && b0 === b1, `${r.status} ${r.message}; balance ${b0} → ${b1}`);
  }
  const editBody = { fullName: "Hacked Name", email: null, idPassport: null, clientType: 0, isActive: true, whatsAppNumber: S.client.phone };
  const ed = await api("PUT", `/api/client/${S.client.id}`, KE, editBody);
  const nameAfter = (await api("GET", `/api/client/${S.client.id}`, UG)).data?.fullName;
  check("Kenyan office cannot edit a Ugandan client", ed.success !== true && nameAfter === "Test Amina", `${ed.status} ${ed.message}; name now ${nameAfter}`);
  check("Kenyan office cannot delete a Ugandan bank account", refusedStatus(await api("DELETE", `/api/bank/${S.bankId}`, KE)));
  if (bTx) {
    const r = await api("GET", `/api/portal/transactions/${bTx}`, CL);
    check("A client cannot open another client's transaction", refusedStatus(r) && noLeak(r, "Decimal deposit"), `${r.status}`);
  }

  // ---------- 4. a dedicated bureau for sessions, brute force and lockout
  const SEC_PHONE = "+254700300400", SEC_PASS = "Sec-Bureau#2026";
  const sec = await api("POST", "/api/company", SA, { name: "Test Security Bureau", ownerName: "Test Owner", whatsAppNumber: SEC_PHONE, email: null, password: SEC_PASS, baseCurrency: Cur.KES });
  if (!check("Super admin creates the security-test bureau", sec.success, sec.message)) return done();
  const secOffice = { code: sec.data.code, phone: SEC_PHONE, password: SEC_PASS };
  let SO = await paced(() => login(secOffice));
  check("Security bureau office signs in", !!SO);
  const mkClient = async (name, phone) => (await api("POST", "/api/client", SO, { fullName: name, whatsAppNumber: phone, email: null, idPassport: null, clientType: 0, password: "Client#2026x", openingBalanceKES: 0, openingBalanceUSD: 0, openingBalanceHome: 0 })).data;
  const c1 = await mkClient("Test Session Client", "+254733000555");
  const c2 = await mkClient("Test Lockout Client", "+254733000666");
  check("Two test clients created", !!c1?.code && !!c2?.code);

  // logout ends the session at once, and only for that person
  const c1Login = await paced(() => api("POST", "/api/auth/login", null, { code: c1.code, phoneNumber: "+254733000555", password: "Client#2026x" }));
  const T1 = c1Login.data?.accessToken, R1 = c1Login.data?.refreshToken;
  check("Client signs in", !!T1 && !!R1, c1Login.message);
  check("Office token works before logout", (await api("GET", "/api/dashboard", SO)).status === 200);
  await api("POST", "/api/auth/logout", SO);
  const officeAfter = await api("GET", "/api/dashboard", SO);
  check("Office token stops working right after logout (not 60 minutes later)", officeAfter.status === 401, `${officeAfter.status}`);
  check("…and the office's logout did NOT sign out the bureau's client", (await api("GET", "/api/portal/dashboard", T1)).status === 200);
  const r1 = await api("POST", "/api/auth/refresh", null, { refreshToken: R1 });
  check("…the client can still refresh their session", r1.success === true, r1.message);
  const T1b = r1.data?.accessToken || T1, R1b = r1.data?.refreshToken || R1;
  await api("POST", "/api/auth/logout", T1b);
  check("Client token stops working right after the client logs out", (await api("GET", "/api/portal/dashboard", T1b)).status === 401);
  const r2 = await api("POST", "/api/auth/refresh", null, { refreshToken: R1b });
  check("A logged-out refresh token cannot be used again", r2.success !== true, r2.message);
  check("An old (already rotated) refresh token cannot be reused", (await api("POST", "/api/auth/refresh", null, { refreshToken: R1 })).success !== true);
  const back = await paced(() => api("POST", "/api/auth/login", null, { code: c1.code, phoneNumber: "+254733000555", password: "Client#2026x" }));
  check("Signing in again after logout works immediately", (await api("GET", "/api/portal/dashboard", back.data?.accessToken)).status === 200, back.message);

  // SMS code brute force
  await sleep(62000); // the code cooldown from the sign-in above
  const mark = readFileSync(LOG, "utf8").length;
  const lg = await paced(() => api("POST", "/api/auth/login", null, { code: secOffice.code, phoneNumber: SEC_PHONE, password: SEC_PASS }));
  const real = lg.success ? await codeFor(SEC_PHONE, mark) : null;
  check("Office sign-in asks for an SMS code", !!real, lg.message);
  if (real) {
    const wrongCode = String((Number(real) + 1) % 1000000).padStart(6, "0");
    const msgs = [];
    for (let i = 0; i < 5; i++) msgs.push((await api("POST", "/api/auth/verify-otp", null, { code: secOffice.code, phoneNumber: SEC_PHONE, otp: wrongCode })).message);
    const after5 = await api("POST", "/api/auth/verify-otp", null, { code: secOffice.code, phoneNumber: SEC_PHONE, otp: real });
    check("After 5 wrong SMS codes, even the right code is refused", !after5.data?.accessToken, `${after5.message} (wrong-code replies: ${[...new Set(msgs)].join(" | ")})`);
  }

  // password lockout
  await sleep(62000);
  for (let i = 0; i < 5; i++) await api("POST", "/api/auth/login", null, { code: c2.code, phoneNumber: "+254733000666", password: "wrong-password" });
  await sleep(62000); // rate-limit window
  const locked = await api("POST", "/api/auth/login", null, { code: c2.code, phoneNumber: "+254733000666", password: "Client#2026x" });
  check("After 5 wrong passwords the account is locked (right password refused)", !locked.data?.accessToken, locked.message);
  check("…the lock message gives an East Africa time, not UTC", !/UTC|Z\b/.test(locked.message || "") , locked.message);
  const rl = [];
  for (let i = 0; i < 12; i++) rl.push((await api("POST", "/api/auth/login", null, { code: "NOPE-0000", phoneNumber: "+254700000001", password: "x" })).status);
  check("Rapid sign-in attempts are rate limited (429 within 12 tries)", rl.includes(429), rl.join(","));

  // ---------- 5. hostile input
  await sleep(62000);
  const xssName = await api("POST", "/api/client", UG, { fullName: "<script>alert(1)</script>", whatsAppNumber: "+256772000999", email: null, idPassport: null, clientType: 1, password: null, openingBalanceKES: 0, openingBalanceUSD: 0, openingBalanceHome: 0 });
  check("A client name containing a script tag is refused", xssName.success === false && xssName.status < 500, `${xssName.status} ${xssName.message}`);
  const XSS = `<img src=x onerror="window.__sarifXss=1;alert('xss')"> Lunch`;
  const xss = await api("POST", "/api/transaction", UG, txn(Txn.Credit, Acc.Client, S.client.id, Acc.Cash, S.tillId, 100, Cur.UGX, XSS));
  check("A description with HTML is stored as plain text (the browser test checks it never runs)", xss.success === true || (xss.status === 400 && xss.success === false), `${xss.status} ${xss.message}`);
  const FORMULA = `=HYPERLINK("http://evil.example","Click me")`;
  const f = await api("POST", "/api/transaction", UG, txn(Txn.Credit, Acc.Client, S.client.id, Acc.Cash, S.tillId, 100, Cur.UGX, FORMULA));
  if (f.success) {
    const csv = await api("GET", "/api/portal/transactions/export", CL);
    const line = (csv.text || "").split(/\r?\n/).find((l) => l.includes("HYPERLINK"));
    check("CSV export neutralises a formula in a description (no cell starts with =)", !!line && !/(^|,)"?=HYPERLINK/.test(line), line || `no export line; status ${csv.status}`);
  }
  const sqli = await api("GET", `/api/client?page=1&pageSize=20&search=${encodeURIComponent("' OR 1=1 --")}`, KE);
  check("SQL-injection style search is harmless (no error, no other bureau's clients)", sqli.status < 500 && noLeak(sqli, "Test Amina"), `${sqli.status}`);
  const big = await api("POST", "/api/transaction", UG, txn(Txn.Credit, Acc.Client, S.client.id, Acc.Cash, S.tillId, 100, Cur.UGX, "x".repeat(20000)));
  check("A 20,000-character description is refused cleanly (not a server error)", big.status < 500 && big.success !== true, `${big.status} ${big.message}`);
  const bad = await fetch(BASE + "/api/transaction", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${UG}`, "Idempotency-Key": crypto.randomUUID() }, body: "{ not json" });
  const badText = await bad.text();
  check("Broken JSON → 400 without internal details", bad.status === 400 && !/at SARIFF\.|StackTrace|System\.Text\.Json\.JsonReaderException|\.cs:line/.test(badText), `${bad.status} ${badText.slice(0, 200)}`);
  const prof = await api("GET", "/api/portal/profile", CL);
  const pBefore = (await api("GET", `/api/client/${S.client.id}`, UG)).data;
  await api("PUT", "/api/portal/profile", CL, { ...(prof.data || {}), balanceKES: 99999999, balanceUSD: 99999999, companyId: sec.data.id, clientType: 0 });
  const pAfter = (await api("GET", `/api/client/${S.client.id}`, UG)).data;
  check("Client profile update cannot change balances or move the client to another bureau",
    pAfter?.balanceKES === pBefore?.balanceKES && pAfter?.balanceUSD === pBefore?.balanceUSD && !!pAfter, `${pBefore?.balanceKES}→${pAfter?.balanceKES}`);

  // ---------- 6. nothing secret in responses
  const secrets = /"passwordHash"|"\$2[aby]\$|refreshTokenHash|"otpCode"|"pinHash"/i;
  const leaks = [];
  for (const [who, tok, path] of [["office", UG, "/api/client?page=1&pageSize=50"], ["office", UG, `/api/client/${S.client.id}`], ["admin", SA, "/api/admin/companies"], ["admin", SA, `/api/admin/companies/${S.ugOffice.companyId}/details`], ["client", CL, "/api/portal/profile"], ["admin", SA, "/api/admin/login-history"]]) {
    const r = await api("GET", path, tok);
    if (secrets.test(r.text || "")) leaks.push(`${who} ${path}`);
  }
  check("No password hashes, PINs or token hashes in any response", leaks.length === 0, leaks.join(", "));

  // ---------- 7. headers
  const hr = await api("GET", "/api/dashboard", UG);
  const hh = (n) => hr.headers?.get(n) || "";
  check("API sends X-Content-Type-Options: nosniff", hh("x-content-type-options") === "nosniff", hh("x-content-type-options"));
  check("API sends X-Frame-Options: DENY", /deny/i.test(hh("x-frame-options")), hh("x-frame-options"));
  check("API sends a Referrer-Policy", !!hh("referrer-policy"), "missing");
  check("API does not announce its server software/version", !/kestrel|asp\.net|\d+\.\d+/i.test(`${hh("server")} ${hh("x-powered-by")}`), `${hh("server")} ${hh("x-powered-by")}`);
  if (WEB) {
    const w = await fetch(WEB + "/login");
    const csp = w.headers.get("content-security-policy") || "";
    check("Web sends a Content-Security-Policy", csp.length > 0, "missing");
    check("Web CSP forbids being framed (clickjacking)", /frame-ancestors 'none'|frame-ancestors 'self'/.test(csp) || /deny|sameorigin/i.test(w.headers.get("x-frame-options") || ""), csp.slice(0, 200));
    check("Web CSP blocks plugins/objects", /object-src 'none'/.test(csp), csp.slice(0, 200));
  }

  // ---------- 8. the security features the README promises leave a trail
  const hist = await api("GET", "/api/admin/login-history?page=1&pageSize=200", SA);
  check("Login history records the failed sign-ins", /wrong|invalid|fail/i.test(hist.text || "") && hist.status === 200, `${hist.status}`);
  const audit = await api("GET", `/api/admin/audit-logs?page=1&pageSize=200&companyId=${S.ugOffice.companyId}`, SA);
  const rows = list(audit.data);
  const kinds = [...new Set(rows.map((x) => `${x.entityType}:${x.action}`))];
  check("Audit log records the Ugandan office's money actions", audit.status === 200 && rows.some((x) => x.entityType === "Transaction" && x.action === 0), `${rows.length} rows: ${kinds.join(", ")}`);
  check("Audit log records who did it (the office user)", rows.some((x) => x.entityType === "Transaction" && x.userId === S.ugOffice.companyId), `${rows.slice(0, 3).map((x) => `${x.entityType} by ${x.userId}`).join("; ")}`);
  check("Audit log records expenses and exchange trades too", rows.some((x) => x.entityType === "Expense") && rows.some((x) => x.entityType === "ExchangeTransaction"), kinds.join(", "));
  check("Audit log never contains password or PIN hashes", !/\$2[aby]\$|PasswordHash":"[^(]/.test(audit.text || ""), "hash found");
  const alerts = await api("GET", "/api/admin/security/alerts", SA);
  check("Security alerts endpoint answers", alerts.status === 200, `${alerts.status}`);

  // ---------- 9. suspended bureau is cut off at once
  const SO2 = await paced(() => login(secOffice));
  const susp = await api("POST", `/api/admin/companies/${sec.data.id}/suspend`, SA, { reason: "Security test" });
  check("Super admin suspends the security-test bureau", susp.success === true || susp.status === 200, susp.message);
  const cut = await api("GET", "/api/dashboard", SO2);
  check("A suspended bureau's open session is refused on its next request", cut.status === 403, `${cut.status} ${cut.message}`);
  done();
})().catch((e) => { check("security test crashed", false, e.stack); done(); });
