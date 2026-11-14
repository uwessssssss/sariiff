// SARIFF soak test: steady mixed traffic for N minutes. The API must keep answering at the
// same speed, without errors and without its memory climbing.
//   node tests/deep/soak.mjs <api-url> <api-log> <e2e-state.json> <minutes> <api-pid>
import { readFileSync } from "node:fs";
import { client, reporter, Cur, Acc, Txn, sleep } from "../lib/sarif.mjs";
const [BASE, LOG, STATE, MIN = "10", PID] = process.argv.slice(2);
const S = JSON.parse(readFileSync(STATE, "utf8"));
const { api, login } = client(BASE, LOG);
const { check, done } = reporter("SOAK");
const rss = () => { try { return +readFileSync(`/proc/${PID}/status`, "utf8").match(/VmRSS:\s+(\d+)/)[1] / 1024; } catch { return NaN; } };
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] || 0; };

(async () => {
  const T = await login(S.ugOffice);
  if (!check("Office signs in", !!T)) return done();
  const reads = ["/api/dashboard", "/api/client?page=1&pageSize=20", `/api/cash/${S.tillId}`, "/api/report/daily", "/api/exchange/float", "/api/transaction?page=1&pageSize=20"];
  const end = Date.now() + +MIN * 60000;
  const mem = [], lat = { first: [], last: [] };
  let n = 0, bad = 0, minute = 0;
  const startAt = Date.now();
  mem.push(rss());
  while (Date.now() < end) {
    const batch = await Promise.all(Array.from({ length: 10 }, (_, i) => {
      if (i === 9) return api("POST", "/api/transaction", T, { transactionType: Txn.Credit, sourceAccountType: Acc.Client, sourceAccountId: S.client.id, destAccountType: Acc.Cash, destAccountId: S.tillId, amount: 10, currency: Cur.UGX, counterAmount: null, counterCurrency: null, description: "Soak", notes: null, exchangeRate: null, paymentMethod: 0 });
      return api("GET", reads[(n + i) % reads.length], T);
    }));
    for (const r of batch) {
      n++; if (r.status >= 500 || r.status === 0 || r.status === 401) bad++;
      const el = Date.now() - startAt;
      if (el < 60000) lat.first.push(r.ms); else if (el > (+MIN - 1) * 60000) lat.last.push(r.ms);
    }
    const m = Math.floor((Date.now() - startAt) / 60000);
    if (m > minute) { minute = m; mem.push(rss()); console.log(`  minute ${m}: ${n} requests, ${bad} errors, API memory ${mem.at(-1).toFixed(0)} MB`); }
    await sleep(250); // ≈ 40 requests a second
  }
  mem.push(rss());
  const p95a = q(lat.first, 0.95), p95b = q(lat.last, 0.95);
  console.log(`  ${n} requests in ${MIN} min; p95 first minute ${p95a.toFixed(0)} ms, last minute ${p95b.toFixed(0)} ms; memory ${mem.map((x) => x.toFixed(0)).join(" → ")} MB`);
  check(`${n.toLocaleString()} requests over ${MIN} minutes with no errors`, bad === 0, `${bad} errors`);
  check("Speed holds: last-minute p95 within 2× the first minute (and under 500 ms)", p95b <= Math.max(2 * p95a, 50) && p95b < 500, `${p95a.toFixed(0)} → ${p95b.toFixed(0)} ms`);
  if (!isNaN(mem[0])) {
    const half = mem[Math.floor(mem.length / 2)], last = mem.at(-1);
    check("Memory settles (second half grows < 25%)", last <= half * 1.25, `${half.toFixed(0)} → ${last.toFixed(0)} MB`);
  }
  done();
})().catch((e) => { check("soak crashed", false, e.stack); done(); });
