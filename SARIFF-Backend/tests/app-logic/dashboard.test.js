// Runs the apps' real compiled helpers. Clock frozen at 01:30 EAT, 9 Nov 2026.
const NOW = Date.parse("2026-11-08T22:30:00Z");
const RealDate = Date;
class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
global.Date = FakeDate;
const store = {}; global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => store[k] = String(v), removeItem: k => delete store[k] };
global.window = { localStorage: global.localStorage, location: { href: "" }, dispatchEvent() {} };
global.process = process;

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};

const webDates = require("./web/dates.js"), mobDates = require("./mob/utils/dates.js"), api = require("./web/api.js");
const { Currency } = api;

console.log("\n-- Dates at 01:30 in Nairobi (it is 9 Nov locally, still 8 Nov in UTC)");
t("OLD pattern toISOString() gives yesterday (the bug)", new Date().toISOString().split("T")[0], "2026-11-08");
t("web localDate() gives today", webDates.localDate(), "2026-11-09");
t("mobile localDate() gives today", mobDates.localDate(), "2026-11-09");
t("OLD month start new Date(y,m,1).toISOString() gives 31 Oct (the bug)", new Date(2026, 10, 1).toISOString().split("T")[0], "2026-10-31");
t("web localDate(new Date(y,m,1)) gives 1 Nov", webDates.localDate(new Date(2026, 10, 1)), "2026-11-01");
t("30-day invoice due date counts from today", webDates.localDate(new Date(Date.now() + 30 * 86400000)), "2026-12-09");

console.log("\n-- Times from the API (login at 20:07 UTC = 23:07 Nairobi)");
const fmtTime = s => new Date(s).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); // = ClientUserDashboard formatTime
t("OLD API time without Z showed 20:07 (the 3-hour bug)", fmtTime("2026-11-08T20:07:05"), "20:07");
t("NEW API time with Z shows 23:07", fmtTime("2026-11-08T20:07:05Z"), "23:07");
const hoursAgo = s => Math.round((NOW - Date.parse(s)) / 3600000 * 10) / 10;
t("a login 2.4 h ago: OLD read as 5.4 h ago", hoursAgo("2026-11-08T20:07:05"), 5.4);
t("a login 2.4 h ago: NEW reads 2.4 h ago", hoursAgo("2026-11-08T20:07:05Z"), 2.4);

console.log("\n-- Wallet currency (same rule as the server)");
t("M-Pesa in a Ugandan bureau = KES", api.walletCurrency(0, Currency.UGX), Currency.KES);
t("MTN MoMo in a Ugandan bureau = UGX", api.walletCurrency(1, Currency.UGX), Currency.UGX);
t("Airtel in a Ugandan bureau = UGX", api.walletCurrency(2, Currency.UGX), Currency.UGX);
t("Airtel in a Kenyan bureau = KES", api.walletCurrency(2, Currency.KES), Currency.KES);
t("UGX shown without decimals", api.formatMoney(2000000, Currency.UGX), "UGX 2,000,000");
t("USD shown with cents", api.formatMoney(7750, Currency.USD), "USD 7,750.00");

(async () => {
  console.log("\n-- Office dashboard holdings, Ugandan bureau with an M-Pesa (KES) and MTN (UGX) wallet");
  const reply = (body) => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => body, text: async () => JSON.stringify(body) });
  const dash = { totalMpesa: 2000000, mobileMoneyByCurrency: [{ currency: 2, currencyCode: "UGX", amount: 2000000 }, { currency: 0, currencyCode: "KES", amount: 50000 }],
                 byCurrency: [{ currency: 2, cash: 5000000, bank: 0 }, { currency: 1, cash: 1200, bank: 0 }], todayTransactions: {} };
  const fx = { baseCurrency: 2, kesBalance: 0, usdBalance: 0, otherBalances: [] };
  global.fetch = async (url) => reply({ success: true, message: "ok", data: url.includes("/exchange/float") ? fx : dash });
  let r = await api.getDashboardStats();
  const h = Object.fromEntries((r.data?.holdings || []).map(x => [x.code, x.mpesa]));
  t("UGX row holds the MTN wallet", h.UGX, 2000000);
  t("KES row holds the M-Pesa wallet (not added to UGX)", h.KES, 50000);
  t("home currency listed first", r.data?.holdings?.[0]?.code, "UGX");

  console.log("\n-- Same dashboard when the exchange-float call fails");
  global.fetch = async (url) => url.includes("/exchange/float") ? { ok: false, status: 500, headers: { get: () => "application/json" }, json: async () => ({ success: false }), text: async () => "" }
                                                                : reply({ success: true, message: "ok", data: url.includes("/dashboard/currencies") ? { baseCurrency: 2 } : dash });
  r = await api.getDashboardStats();
  t("home currency still listed first", r.data?.holdings?.[0]?.code, "UGX");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})();
