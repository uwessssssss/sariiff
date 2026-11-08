// Load + money-under-pressure test. Run after e2e.mjs (and the browser test).
//   node tests/e2e/load.mjs <api-url> <api-log> <e2e-state.json>
// 1. 300 deposits of 1,000 UGX hit the SAME client and the SAME till from 25 workers at once.
//    Whatever succeeds must be counted exactly once: client and till must move by
//    exactly 1,000 × (successful deposits). No lost updates, no double counting, no 500s.
// 2. 25 workers read the busy pages (dashboard, clients, transactions, cash, reports) for 30 s.
//    Reports the speed (median / 95th percentile) and fails on any 500 or a 95th > 2 s.
import { readFileSync } from "node:fs";
const BASE = process.argv[2], LOG = process.argv[3];
const S = JSON.parse(readFileSync(process.argv[4], "utf8"));
const UGX = 2, Credit = 1, Cash = 0, Client = 3;
let pass = 0, fail = 0;
const check = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok || !d ? "" : `\n        ${d}`}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, token, body) {
  const t0 = performance.now();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  if (method !== "GET") headers["Idempotency-Key"] = crypto.randomUUID();
  try {
    const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await res.json(); } catch {}
    return { status: res.status, ms: performance.now() - t0, ...(j || {}) };
  } catch (e) { return { status: 0, ms: performance.now() - t0, message: e.message }; }
}

async function login({ code, phone, password }) {
  let mark = readFileSync(LOG, "utf8").length;
  const go = () => fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, phoneNumber: phone, password }) }).then((x) => x.json());
  let r = await go();
  const w = /Please wait (\d+) seconds/.exec(r.message || "");
  if (w) { console.log(`        (waiting ${w[1]} s: a code went to this phone less than a minute ago)`); await sleep((+w[1] + 2) * 1000); mark = readFileSync(LOG, "utf8").length; r = await go(); }
  if (!r.success) console.log(`        login: ${r.message}`);
  if (r.data?.accessToken) return r.data.accessToken;
  const re = new RegExp(`Message to "?${phone.replace(/[+]/g, "\\+")}"?: "?Sarif: Your verification code is (\\d{6})`, "g");
  for (let i = 0; i < 60; i++) {
    let all = [...readFileSync(LOG, "utf8").slice(mark).matchAll(re)];
    if (!all.length && i >= 12) all = [...readFileSync(LOG, "utf8").matchAll(re)]; // reused recent code
    if (all.length) {
      const v = await fetch(BASE + "/api/auth/verify-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, phoneNumber: phone, otp: all.at(-1)[1] }) }).then((x) => x.json());
      return v.data?.accessToken;
    }
    await sleep(250);
  }
}

const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] || 0; };
const list = (d) => (Array.isArray(d) ? d : d?.items || d?.Items || []);
const ugx = (c) => (c?.otherBalances || []).find((b) => b.currency === UGX)?.balance;

(async () => {
  console.log(`SARIFF load test — ${BASE}\n`);
  const tok = await login(S.ugOffice);
  check("Office signs in for the load test", !!tok, "no token");
  if (!tok) return done();
  const clientBefore = ugx((await api("GET", `/api/client/${S.client.id}`, tok)).data);
  const tillBefore = list((await api("GET", "/api/cash", tok)).data).find((c) => c.id === S.tillId)?.balance;
  const txBefore = (await api("GET", `/api/transaction?page=1&pageSize=1`, tok)).data?.totalCount;

  // ---- 1. concurrent deposits
  const N = 300, W = 25;
  let next = 0, ok = 0, conflict = 0, other = {}, five = 0;
  const lat = [];
  await Promise.all(Array.from({ length: W }, async () => {
    while (next < N) {
      next++;
      const r = await api("POST", "/api/transaction", tok, {
        transactionType: Credit, sourceAccountType: Client, sourceAccountId: S.client.id, destAccountType: Cash, destAccountId: S.tillId,
        amount: 1000, currency: UGX, counterAmount: null, counterCurrency: null, description: "Load deposit", notes: null, exchangeRate: null, paymentMethod: 0,
      });
      lat.push(r.ms);
      if (r.success) ok++;
      else if (r.status >= 500 || r.status === 0) { five++; other[`${r.status} ${r.message || ""}`.slice(0, 80)] = (other[`${r.status} ${r.message || ""}`.slice(0, 80)] || 0) + 1; }
      else if (r.status === 409) conflict++;
      else other[`${r.status} ${r.message || ""}`.slice(0, 80)] = (other[`${r.status} ${r.message || ""}`.slice(0, 80)] || 0) + 1;
    }
  }));
  console.log(`        ${N} deposits from ${W} workers: ${ok} posted, ${conflict} asked to retry (409), others ${JSON.stringify(other)}`);
  console.log(`        deposit speed: median ${q(lat, 0.5).toFixed(0)} ms, 95th ${q(lat, 0.95).toFixed(0)} ms`);
  const clientAfter = ugx((await api("GET", `/api/client/${S.client.id}`, tok)).data);
  const tillAfter = list((await api("GET", "/api/cash", tok)).data).find((c) => c.id === S.tillId)?.balance;
  const txAfter = (await api("GET", `/api/transaction?page=1&pageSize=1`, tok)).data?.totalCount;
  check("No server errors (500) under 25 parallel deposits", five === 0, JSON.stringify(other));
  check("Most deposits go through (≥ 90%)", ok >= N * 0.9, `${ok}/${N}`);
  check(`Client moved by exactly ${ok} × 1,000 UGX (no lost or doubled update)`, clientAfter - clientBefore === ok * 1000, `before ${clientBefore}, after ${clientAfter}, diff ${clientAfter - clientBefore}`);
  check(`Till moved by exactly ${ok} × 1,000 UGX`, tillAfter - tillBefore === ok * 1000, `before ${tillBefore}, after ${tillAfter}, diff ${tillAfter - tillBefore}`);
  if (txBefore !== undefined && txAfter !== undefined)
    check(`Exactly ${ok} transactions were recorded`, txAfter - txBefore === ok, `before ${txBefore}, after ${txAfter}`);

  // ---- 2. idempotency: the same request sent twice is one deposit
  const key = crypto.randomUUID();
  const body = JSON.stringify({ transactionType: Credit, sourceAccountType: Client, sourceAccountId: S.client.id, destAccountType: Cash, destAccountId: S.tillId, amount: 777, currency: UGX, counterAmount: null, counterCurrency: null, description: "Retry test", notes: null, exchangeRate: null, paymentMethod: 0 });
  const h = { "Content-Type": "application/json", Authorization: `Bearer ${tok}`, "Idempotency-Key": key };
  const c0 = ugx((await api("GET", `/api/client/${S.client.id}`, tok)).data);
  await Promise.all([1, 2, 3].map(() => fetch(BASE + "/api/transaction", { method: "POST", headers: h, body })));
  const c1 = ugx((await api("GET", `/api/client/${S.client.id}`, tok)).data);
  check("A deposit sent 3 times at once (bad network retry) counts once", c1 - c0 === 777, `moved ${c1 - c0}`);

  // ---- 3. read load
  const paths = ["/api/dashboard", "/api/client?page=1&pageSize=20", "/api/transaction?page=1&pageSize=20", "/api/cash", "/api/mpesa", `/api/client/${S.client.id}`];
  const rl = [], bad = {};
  const end = Date.now() + 30000;
  await Promise.all(Array.from({ length: W }, async (_, i) => {
    let k = i;
    while (Date.now() < end) {
      const p = paths[k++ % paths.length];
      const r = await api("GET", p, tok);
      rl.push(r.ms);
      if (r.status !== 200) bad[`${r.status} ${p.split("?")[0]}`] = (bad[`${r.status} ${p.split("?")[0]}`] || 0) + 1;
    }
  }));
  const rps = (rl.length / 30).toFixed(0);
  console.log(`        ${rl.length} page reads in 30 s (${rps}/s): median ${q(rl, 0.5).toFixed(0)} ms, 95th ${q(rl, 0.95).toFixed(0)} ms, slowest ${Math.max(...rl).toFixed(0)} ms`);
  check("Every read answered OK under 25 parallel users", Object.keys(bad).length === 0, JSON.stringify(bad));
  check("95% of reads answer within 2 s", q(rl, 0.95) < 2000, `${q(rl, 0.95).toFixed(0)} ms`);
  done();
})().catch((e) => { check("load test crashed", false, e.stack); done(); });

function done() { console.log(`\nLOAD: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
