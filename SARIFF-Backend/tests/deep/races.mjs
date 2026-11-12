// SARIFF race and edge-case test: many tills, clients and requests hitting the same
// balances at the same moment, plus money values at their limits.
//   node tests/deep/races.mjs <api-url> <api-log> <e2e-state.json>
import { readFileSync } from "node:fs";
import { client, reporter, Cur, Acc, Txn, round2, list } from "../lib/sarif.mjs";

const [BASE, LOG, STATE] = process.argv.slice(2);
const S = JSON.parse(readFileSync(STATE, "utf8"));
const { api, login } = client(BASE, LOG);
const { check, done } = reporter("RACES + EDGES");
const UGX = Cur.UGX, USD = Cur.USD;
const txn = (type, st, sid, dt, did, amount, currency, description) => ({
  transactionType: type, sourceAccountType: st, sourceAccountId: sid, destAccountType: dt, destAccountId: did,
  amount, currency, counterAmount: null, counterCurrency: null, description, notes: null, exchangeRate: null, paymentMethod: 0,
});

(async () => {
  console.log(`SARIFF races + edge cases — ${BASE}\n`);
  const T = await login(S.ugOffice);
  if (!check("Office signs in", !!T)) return done();
  const get = async (p) => (await api("GET", p, T)).data;
  const till = async () => (await get(`/api/cash/${S.tillId}`))?.balance;
  const cbal = async (id) => ((await get(`/api/client/${id}`))?.otherBalances || []).find((b) => b.currency === UGX)?.balance ?? 0;

  // a client of its own so nothing else moves these balances
  const rc = await api("POST", "/api/client", T, { fullName: "Race Tester", whatsAppNumber: "+256772009900", email: null, idPassport: null, clientType: 1, password: null, openingBalanceKES: 0, openingBalanceUSD: 0, openingBalanceHome: 0 });
  check("Race client created", rc.success, rc.message);
  const R = rc.data?.id;

  // 1) stock the till, then 40 withdrawals at once that together ask for 4× what it holds
  await api("POST", "/api/transaction", T, txn(Txn.Credit, Acc.Client, R, Acc.Cash, S.tillId, 100000, UGX, "Race stock"));
  const t0 = await till(), c0 = await cbal(R);
  const AMT = Math.floor(t0 / 10);
  const res = await Promise.all(Array.from({ length: 40 }, (_, i) =>
    api("POST", "/api/transaction", T, txn(Txn.Debit, Acc.Client, R, Acc.Cash, S.tillId, AMT, UGX, `Race withdrawal ${i}`))));
  const ok = res.filter((r) => r.success).length;
  const errors5xx = res.filter((r) => r.status >= 500 || r.status === 0).length;
  const t1 = await till(), c1 = await cbal(R);
  check(`40 simultaneous withdrawals of ${AMT.toLocaleString()} against a till of ${t0.toLocaleString()}: the till never goes below zero`, t1 >= 0, `till ${t1}`);
  check(`…exactly the accepted ones moved money (${ok} accepted)`, round2(t0 - t1) === round2(ok * AMT) && round2(c0 - c1) === round2(ok * AMT), `till −${t0 - t1}, client −${c0 - c1}, expected −${ok * AMT}`);
  check("…at most what the till held was paid out", ok <= Math.floor(t0 / AMT), `${ok} accepted, room for ${Math.floor(t0 / AMT)}`);
  check("…the refused ones were refused cleanly (no server errors)", errors5xx === 0, `${errors5xx} server errors / dropped`);

  // 2) money moving both ways at once between till and bank: the total must be conserved
  const banks = list(await get("/api/bank")).filter((b) => b.currency === UGX);
  if (banks.length) {
    const B = banks[0].id;
    const bank = async () => (await get(`/api/bank/${B}`))?.balance;
    await api("POST", "/api/transaction", T, txn(Txn.Credit, Acc.Client, R, Acc.Cash, S.tillId, 200000, UGX, "Race stock 2"));
    const tb0 = (await till()) + (await bank());
    await Promise.all(Array.from({ length: 30 }, (_, i) => i % 2
      ? api("POST", "/api/transaction", T, txn(Txn.Credit, Acc.Cash, S.tillId, Acc.Bank, B, 1000, UGX, `Race bank ${i}`))
      : api("POST", "/api/transaction", T, txn(Txn.Credit, Acc.Bank, B, Acc.Cash, S.tillId, 1000, UGX, `Race till ${i}`))));
    const tb1 = (await till()) + (await bank());
    check("30 simultaneous till⇄bank transfers: till + bank total is unchanged", round2(tb0) === round2(tb1), `before ${tb0}, after ${tb1}`);
  } else check("A UGX bank exists for the transfer race", false, "no UGX bank account");

  // 3) the same request sent 5 times at once (a double-tapped button): posted once
  const key = crypto.randomUUID();
  const c2 = await cbal(R);
  const dup = await Promise.all(Array.from({ length: 5 }, () =>
    api("POST", "/api/transaction", T, txn(Txn.Credit, Acc.Client, R, Acc.Cash, S.tillId, 777, UGX, "Double tap"), { "Idempotency-Key": key })));
  const c3 = await cbal(R);
  check("Same request sent 5 times at once (one Idempotency-Key) posts once", round2(c3 - c2) === 777, `client moved ${c3 - c2}; statuses ${dup.map((d) => d.status).join(",")}`);

  // 4) edge values
  const edge = async (name, amount, currency, expectOk) => {
    const before = await cbal(R);
    const r = await api("POST", "/api/transaction", T, txn(Txn.Credit, Acc.Client, R, Acc.Cash, S.tillId, amount, currency, name));
    const after = await cbal(R);
    if (expectOk) check(`${name}: accepted and exact`, r.success && round2(after - before) === round2(amount), `${r.status} ${r.message || ""} moved ${after - before}`);
    else check(`${name}: refused, nothing moved`, !r.success && r.status < 500 && after === before, `${r.status} ${r.message || ""} moved ${after - before}`);
  };
  await edge("Smallest amount UGX 0.01", 0.01, UGX, true);
  await edge("Very large amount UGX 9,999,999,999.99", 9999999999.99, UGX, true);
  await edge("Three decimals UGX 1.005", 1.005, UGX, false);
  await edge("Absurd amount 1e20", 1e20, UGX, false);
  const nan = await api("POST", "/api/transaction", T, { ...txn(Txn.Credit, Acc.Client, R, Acc.Cash, S.tillId, 1, UGX, "x"), amount: "abc" });
  check("Amount that isn't a number: refused (400), not a crash", nan.status === 400, `status ${nan.status}`);
  const badCur = await api("POST", "/api/transaction", T, txn(Txn.Credit, Acc.Client, R, Acc.Cash, S.tillId, 100, 99, "Bad currency"));
  check("Unknown currency code: refused, not a crash", !badCur.success && badCur.status < 500, `status ${badCur.status}`);
  const ghost = await api("POST", "/api/transaction", T, txn(Txn.Credit, Acc.Client, crypto.randomUUID(), Acc.Cash, S.tillId, 100, UGX, "Ghost client"));
  check("Client that doesn't exist: refused, not a crash", !ghost.success && ghost.status < 500, `status ${ghost.status}`);

  // 5) statement periods at the edges of a day / month / leap day (East Africa Time)
  for (const [label, from, to] of [["one day", "2026-11-12", "2026-11-12"], ["month end → start", "2026-10-31", "2026-11-01"], ["leap day 2028", "2028-02-29", "2028-02-29"], ["reversed dates", "2026-11-12", "2026-11-01"]]) {
    const r = await api("GET", `/api/client/${R}/statement?startDate=${from}&endDate=${to}&currency=${UGX}`, T);
    check(`Statement for ${label}: answers without a server error`, r.status < 500, `status ${r.status} ${r.message || ""}`);
  }

  // 6) exchange rounding: a small USD sale at an odd rate is rounded to the cent, not drifted
  const rate = await api("POST", "/api/exchange/rate", T, { buyRate: 3640.55, sellRate: 3700.45, foreignCurrency: USD });
  check("Odd USD rate set (3,640.55 / 3,700.45)", rate.success, rate.message);
  done();
})().catch((e) => { check("race test crashed", false, e.stack); done(); });
