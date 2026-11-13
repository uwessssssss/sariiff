// Line audit W9: the bureau's home currency is fetched once per page and cached. When that
// first request failed (offline at start, a Render cold start), KES was cached for good: a
// Ugandan bureau then saw every rate, profit and total labelled in KES until a full reload.
// Signing in to another bureau while the old answer was still on its way cached the old one.
const store = {}; global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => store[k] = String(v), removeItem: k => delete store[k] };
global.window = { localStorage: global.localStorage, location: { href: "" }, dispatchEvent() {} };
global.document = { cookie: "" };
const UGX = 2, KES = 0;
let reply = "fail";
let release = null;
global.fetch = async (url) => {
  if (!url.endsWith("/api/dashboard/currencies")) throw new Error("unexpected " + url);
  if (reply === "fail") throw new TypeError("Network request failed");
  if (reply === "slow-kes") await new Promise(r => { release = r; });
  const base = reply === "slow-kes" ? KES : UGX;
  return { ok: true, status: 200, json: async () => ({ success: true, message: "ok", data: { currencies: [], baseCurrency: base } }) };
};
const B = require("./web/useBaseCurrency");
let pass = 0; const fails = [];
const check = (name, got, want) => got === want ? pass++ : fails.push(`[base currency] ${name}: got ${got}, want ${want}`);
(async () => {
  check("offline at start falls back to KES", await B.loadBaseCurrency(), KES);
  reply = "ugx";
  check("the next load, once online, gets UGX", await B.loadBaseCurrency(), UGX);

  // Switch bureau while the previous bureau's (KES) answer is still on its way.
  B.resetBaseCurrency(); reply = "slow-kes";
  const old = B.loadBaseCurrency();
  await new Promise(r => setTimeout(r, 10));
  B.resetBaseCurrency(); reply = "ugx";      // signed in to the Ugandan bureau
  release(); await old;
  check("an answer for the previous bureau is not kept", await B.loadBaseCurrency(), UGX);

  console.log(`${pass} passed, ${fails.length} failed` + (fails.length ? "\n\nFAILURES:\n" + fails.join("\n") : ""));
  if (fails.length) process.exitCode = 1;
})();
