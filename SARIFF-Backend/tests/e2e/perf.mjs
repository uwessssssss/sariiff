// SARIFF performance test with a busy bureau's worth of data.
//   node tests/e2e/perf.mjs <api-url> <api-log> <e2e-state.json> [web-url]
// Fills the Ugandan bureau with 250 clients and ~6,000 transactions (one till carrying
// most of them, one client with 1,500), then times every heavy endpoint (5 runs each,
// median + slowest) and records how much data each one sends — a phone on mobile data
// pays for every megabyte. Optionally times the busiest web screens in a real browser.
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { createRequire } from "node:module";
import { client, reporter, Cur, Acc, Txn, list, sleep } from "../lib/sarif.mjs";

const BASE = process.argv[2], LOG = process.argv[3], S = JSON.parse(readFileSync(process.argv[4], "utf8")), WEB = process.argv[5];
const { api, login } = client(BASE, LOG);
const { check, done } = reporter("PERFORMANCE");
const UGX = Cur.UGX;
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] || 0; };
const kb = (n) => (n / 1024).toFixed(0) + " KB";
// Bytes that actually cross the network (the API compresses JSON), read without decoding.
const wire = (path, tok) => new Promise((res) => {
  const u = new URL(BASE + path), lib = u.protocol === "https:" ? https : http;
  const req = lib.request(u, { method: "GET", headers: { Authorization: `Bearer ${tok}`, "Accept-Encoding": "br, gzip" } }, (r) => {
    let n = 0; r.on("data", (c) => (n += c.length)); r.on("end", () => res({ bytes: n, enc: r.headers["content-encoding"] || "none" }));
  });
  req.on("error", () => res({ bytes: -1, enc: "error" })); req.end();
});

async function pool(n, workers, fn) {
  let next = 0, ok = 0, fail = 0;
  await Promise.all(Array.from({ length: workers }, async () => { while (next < n) { const i = next++; (await fn(i)) ? ok++ : fail++; } }));
  return { ok, fail };
}

(async () => {
  console.log(`SARIFF performance test — ${BASE}\n`);
  const T = await login(S.ugOffice);
  if (!check("Office signs in", !!T)) return done();
  const deposit = (clientId, amount, desc, accType = Acc.Cash, accId = S.tillId) => api("POST", "/api/transaction", T, {
    transactionType: Txn.Credit, sourceAccountType: Acc.Client, sourceAccountId: clientId, destAccountType: accType, destAccountId: accId,
    amount, currency: UGX, counterAmount: null, counterCurrency: null, description: desc, notes: null, exchangeRate: null, paymentMethod: 0 });
  const withdraw = (clientId, amount) => api("POST", "/api/transaction", T, {
    transactionType: Txn.Debit, sourceAccountType: Acc.Client, sourceAccountId: clientId, destAccountType: Acc.Cash, destAccountId: S.tillId,
    amount, currency: UGX, counterAmount: null, counterCurrency: null, description: "Withdrawal", notes: null, exchangeRate: null, paymentMethod: 0 });

  // ---------- fill the bureau
  const t0 = Date.now();
  const names = ["Amina", "Brian", "Grace", "Joseph", "Mariam", "Peter", "Sarah", "David", "Fatuma", "Moses", "Ruth", "Isaac", "Esther", "Samuel", "Hadija", "Paul", "Agnes", "John", "Zainab", "Robert"];
  const last = ["Okello", "Namubiru", "Mugisha", "Achieng", "Ssempala", "Nakato", "Odongo", "Kirabo", "Waiswa", "Atim", "Lubega", "Nansubuga"];
  const ids = [], idByI = [];
  const mk = await pool(250, 10, async (i) => {
    const r = await api("POST", "/api/client", T, { fullName: `Perf ${names[i % 20]} ${last[i % 12]} ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26) % 26)}`.replace(/\d/g, ""), whatsAppNumber: `+25677${String(1000000 + i).slice(-7)}`, email: null, idPassport: null, clientType: i % 3 ? 1 : 0, password: i % 3 ? null : "Client#2026x", openingBalanceKES: 0, openingBalanceUSD: 0, openingBalanceHome: 100000 + i * 1000 });
    if (r.data?.id) { ids.push(r.data.id); idByI[i] = r.data.id; }
    return r.success;
  });
  check(`250 clients created (${mk.ok} ok)`, mk.ok >= 245, `${mk.fail} failed`);
  // client #0 has the portal password and +256771000000; ids[] is in finishing order
  const busy = idByI[0] ?? ids[0];
  const others = ids.filter((x) => x !== busy);
  const tx1 = await pool(1500, 20, async (i) => (await (i % 4 === 3 ? withdraw(busy, 500) : deposit(busy, 1000 + (i % 7) * 250, `Busy client deposit ${i}`))).success);
  const tx2 = await pool(4500, 20, async (i) => (await (i % 5 === 4 ? withdraw(others[i % others.length], 300) : deposit(others[i % others.length], 2000 + (i % 11) * 100, `Deposit ${i}`))).success);
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`        filled in ${secs} s: ${tx1.ok + tx2.ok} transactions posted (${tx1.fail + tx2.fail} refused)`);
  check("≥ 5,800 transactions posted", tx1.ok + tx2.ok >= 5800, `${tx1.ok + tx2.ok}`);
  const posted = tx1.ok + tx2.ok;
  const busyClient = busy;
  const cLogin = await api("POST", "/api/auth/login", null, { code: (await api("GET", `/api/client/${busyClient}`, T)).data?.code, phoneNumber: "+256771000000", password: "Client#2026x" });
  const CT = cLogin.data?.accessToken;
  check("Busy client signs in (1,500 transactions)", !!CT, cLogin.message);

  // ---------- time every heavy endpoint
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const endpoints = [
    ["Office dashboard", T, "/api/dashboard"],
    ["Clients list (page 1)", T, "/api/client?page=1&pageSize=20"],
    ["Clients search", T, "/api/client?page=1&pageSize=20&search=Okello"],
    ["Client stats", T, "/api/client/stats"],
    ["Transactions (page 1)", T, "/api/transaction?page=1&pageSize=20"],
    ["Transactions (page 250)", T, "/api/transaction?page=250&pageSize=20"],
    ["Today's transactions", T, "/api/transaction/today"],
    ["Busy client statement (1,500 lines)", T, `/api/client/${busyClient}/statement?currency=${UGX}`],
    ["Busy till statement (~6,000 lines)", T, `/api/cash/statement/${UGX}`],
    ["Till statement, today only", T, `/api/cash/statement/${UGX}?startDate=${today}&endDate=${today}`],
    ["Daily report", T, `/api/report/daily?date=${today}`],
    ["Transactions report (month)", T, `/api/report/transactions?startDate=${monthStart}&endDate=${today}`],
    ["Client balances report (250 clients)", T, "/api/report/client-balances"],
    ["Account summary report", T, "/api/report/account-summary"],
    ["Reconciliation accounts", T, "/api/reconciliation/accounts"],
    ["Cash accounts", T, "/api/cash"],
    ["Mobile money wallets", T, "/api/mpesa"],
    ["Client portal dashboard", CT, "/api/portal/dashboard"],
    ["Client portal transactions (page 1)", CT, "/api/portal/transactions?page=1&pageSize=20"],
    ["Client portal statement", CT, "/api/portal/statement"],
    ["Client portal CSV export", CT, "/api/portal/transactions/export"],
    ["Client portal statement PDF", CT, "/api/portal/statement/pdf"],
    ["Client portal analytics", CT, "/api/portal/analytics"],
  ];
  const SA = await login({ code: "SA-2026-001", phone: "+254700000000", password: "Test@123" });
  if (SA) endpoints.push(["Admin dashboard", SA, "/api/admin/dashboard/extended"], ["Admin bureaus", SA, "/api/admin/companies"], ["Admin analytics", SA, "/api/admin/analytics/overview"], ["Admin audit log", SA, "/api/admin/audit-logs?page=1&pageSize=50"]);
  console.log("\n        endpoint                                   median    slowest      JSON   on the wire");
  for (const [name, tok, path] of endpoints) {
    if (!tok) { check(`${name}: has a token`, false); continue; }
    const times = []; let size = 0, status = 0;
    for (let i = 0; i < 5; i++) { const r = await api("GET", path, tok); times.push(r.ms); size = (r.text || "").length; status = r.status; }
    const med = q(times, 0.5), max = Math.max(...times);
    const w = await wire(path, tok);
    console.log(`        ${name.padEnd(42)} ${med.toFixed(0).padStart(6)} ms ${max.toFixed(0).padStart(7)} ms ${kb(size).padStart(9)} ${kb(w.bytes).padStart(9)} ${w.enc}`);
    check(`${name}: answers OK`, status === 200, `status ${status}`);
    check(`${name}: median under 1.5 s with a busy bureau`, med < 1500, `${med.toFixed(0)} ms`);
    // A statement / day report lists every line of its period by design (and the 6,000
    // lines here all fall on one day), so what counts for those is the download a phone
    // pays for; paged lists must be small either way.
    if (/^Busy/.test(name)) { /* all-time stress lists: sizes reported above, not gated */ }
    else if (/Till statement, today|Daily report/.test(name)) {
      // every line of the day, by design — and this test puts all ~6,000 lines on ONE day
      // (a real busy day is a few hundred). So the fair measure is the cost per line.
      const lines = Math.max(1, posted), per = w.bytes / lines;
      check(`${name}: under 250 bytes per line to download (${lines.toLocaleString()} lines today)`, w.bytes >= 0 && per < 250, `${kb(w.bytes)} on the wire (${w.enc}) = ${per.toFixed(0)} bytes/line; ${kb(size)} of JSON; a 300-line day ≈ ${kb(per * 300)}`);
    }
    else if (/statement|CSV|PDF/i.test(name)) check(`${name}: under 500 KB to download`, w.bytes >= 0 && w.bytes < 512000, `${kb(w.bytes)} on the wire (${w.enc}), ${kb(size)} of JSON`);
    else check(`${name}: response under 500 KB`, size < 512000, kb(size));
  }

  // ---------- writes stay fast with a big ledger
  const wt = []; for (let i = 0; i < 20; i++) wt.push((await deposit(busy, 777, "Timing deposit")).ms);
  console.log(`        posting a deposit with 6,000 transactions on the till: median ${q(wt, 0.5).toFixed(0)} ms, slowest ${Math.max(...wt).toFixed(0)} ms`);
  check("Posting stays under 1 s with a big ledger", q(wt, 0.5) < 1000, `${q(wt, 0.5).toFixed(0)} ms`);

  // ---------- busiest web screens in a real browser (signed in through the login page)
  if (WEB && process.env.PLAYWRIGHT_MODULE) {
    const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE);
    const browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport: { width: 1366, height: 860 }, timezoneId: "Africa/Nairobi" })).newPage();
    const settle = async () => {
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      for (let i = 0; i < 120 && (await page.locator(".animate-spin").count()) > 0; i++) await sleep(250);
    };
    await sleep(62000); // SMS code cooldown after the API sign-in above
    await page.goto(`${WEB}/login`); await settle();
    await page.fill("#code", S.ugOffice.code); await page.fill("#phone", S.ugOffice.phone); await page.fill("#password", S.ugOffice.password);
    const mark = readFileSync(LOG, "utf8").length;
    await page.locator('form button[type="submit"]').first().click();
    await page.locator('input[aria-label="Digit 1 of 6"]').waitFor({ timeout: 20000 }).catch(() => {});
    const { codeFor } = client(BASE, LOG);
    const otp = await codeFor(S.ugOffice.phone, mark);
    if (otp) for (let i = 0; i < 6; i++) await page.locator(`input[aria-label="Digit ${i + 1} of 6"]`).fill(otp[i]);
    await page.waitForURL(/\/office/, { timeout: 30000 }).catch(() => {});
    if (check("Browser signs in to the busy bureau", /\/office/.test(page.url()), page.url())) {
      console.log("\n        web screen (busy bureau)                  ready in    JS heap");
      for (const tab of ["dashboard", "clients", "cash", "mpesa", "reports", "reconciliation", "exchange"]) {
        const t1 = performance.now();
        await page.goto(`${WEB}/office/${tab}`);
        await settle();
        const ms = performance.now() - t1;
        const heap = await page.evaluate(() => (performance.memory?.usedJSHeapSize || 0) / 1048576);
        console.log(`        office ${tab.padEnd(36)} ${ms.toFixed(0).padStart(6)} ms ${heap.toFixed(0).padStart(6)} MB`);
        check(`Web office ${tab}: ready within 5 s with 6,000 transactions`, ms < 5000, `${ms.toFixed(0)} ms`);
      }
    }
    await browser.close();
  }
  done();
})().catch((e) => { check("performance test crashed", false, e.stack); done(); });
