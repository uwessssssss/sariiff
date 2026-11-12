// Logic tests across web + mobile, using each app's REAL compiled code.
const NOW = Date.parse("2026-11-08T22:30:00Z"); // 01:30 on 9 Nov in Nairobi
const RealDate = Date;
class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
global.Date = FakeDate;
const store = {}; global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => store[k] = String(v), removeItem: k => delete store[k] };
global.window = { localStorage: global.localStorage, location: { href: "" }, dispatchEvent() {} };

const W = { api: require("./web/api"), dates: require("./web/dates.js"), flow: require("./web/moneyflow.js"),
            base: require("./web/useBaseCurrency.js"), wa: require("./web/whatsapp.js"), print: require("./web/print.js") };
const M = { types: require("./mob/types/index.js"), dates: require("./mob/utils/dates.js"), flow: require("./mob/utils/moneyflow.js") };
const KES = 0, USD = 1, UGX = 2, EUR = 3;
const Cash = 0, Bank = 1, Mpesa = 2, Client = 3, Expense = 4, Debit = 0, Credit = 1;

let pass = 0, fail = 0; const fails = [];
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function t(group, name, got, want) {
  if (eq(got, want)) pass++; else { fail++; fails.push(`[${group}] ${name}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
}
const both = (group, name, fw, fm, want) => { t(group, "web: " + name, fw, want); t(group, "mobile: " + name, fm, want); };

// ---------- 1. Money direction (in/out) — the debit/credit rule, both apps
const flowCases = [
  ["client deposits cash (Client→Cash, credit)", { sourceAccountType: Client, destAccountType: Cash, transactionType: Credit, amount: 1000, currency: KES }, { kind: "in", amount: 1000, currency: KES }],
  ["client withdraws (Cash→Client, credit on cash)", { sourceAccountType: Cash, destAccountType: Client, transactionType: Credit, amount: 1000, currency: KES }, { kind: "out", amount: 1000, currency: KES }],
  ["cash received entered from cash side (Cash debit)", { sourceAccountType: Cash, destAccountType: Client, transactionType: Debit, amount: 500, currency: USD }, { kind: "in", amount: 500, currency: USD }],
  ["withdrawal entered from client side (Client debit → Cash)", { sourceAccountType: Client, destAccountType: Cash, transactionType: Debit, amount: 700, currency: KES }, { kind: "out", amount: 700, currency: KES }],
  ["till to till is a transfer (Cash→Bank)", { sourceAccountType: Cash, destAccountType: Bank, transactionType: Credit, amount: 9000, currency: KES }, { kind: "transfer", amount: 9000, currency: KES }],
  ["M-Pesa wallet counts as a till", { sourceAccountType: Client, destAccountType: Mpesa, transactionType: Credit, amount: 300, currency: KES }, { kind: "in", amount: 300, currency: KES }],
  ["client to client moves no till (none)", { sourceAccountType: Client, destAccountType: Client, transactionType: Debit, amount: 50, currency: USD }, { kind: "none", amount: 50, currency: USD }],
  ["forex: client pays UGX, cash receives USD → in, in USD", { sourceAccountType: Client, destAccountType: Cash, transactionType: Credit, amount: 3700000, currency: UGX, counterAmount: 1000, counterCurrency: USD }, { kind: "in", amount: 1000, currency: USD }],
  ["negative amounts are made positive", { sourceAccountType: Cash, destAccountType: Client, transactionType: Credit, amount: -250, currency: KES }, { kind: "out", amount: 250, currency: KES }],
  ["expense paid from bank is money out", { sourceAccountType: Bank, destAccountType: Expense, transactionType: Credit, amount: 1200, currency: KES }, { kind: "out", amount: 1200, currency: KES }],
];
for (const [n, tx, want] of flowCases) both("money flow", n, W.flow.bureauFlow(tx), M.flow.bureauFlow(tx), want);

// ---------- 2. Which currencies a bureau may use, both apps agree
for (const [home, want] of [[KES, [KES, USD, EUR]], [UGX, [UGX, USD, KES, EUR]]]) {
  both("currency rules", `allowed for home ${home}`, W.base.allowedCurrenciesFor(home), M.types.allowedCurrenciesFor(home), want);
  for (const c of [KES, USD, UGX, EUR])
    t("currency rules", `web and mobile agree: home ${home} allows ${c}`, W.base.isCurrencyAllowed(home, c), M.types.isCurrencyAllowed(home, c));
}
t("currency rules", "Kenyan bureau may NOT use UGX", W.base.isCurrencyAllowed(KES, UGX), false);
t("currency rules", "Ugandan bureau MAY use KES", W.base.isCurrencyAllowed(UGX, KES), true);
both("currency rules", "foreign currencies of a Ugandan bureau", W.base.foreignCurrenciesFor(UGX), M.types.foreignCurrenciesFor(UGX), [USD, KES, EUR]);

// ---------- 3. Mobile money wallet currency, web = mobile = server rule
for (const home of [KES, UGX]) for (const p of [0, 1, 2])
  t("wallets", `web and mobile agree: network ${p} at home ${home}`, W.api.walletCurrency(p, home), M.types.walletCurrency(p, home));
t("wallets", "M-Pesa at Ugandan bureau = KES", M.types.walletCurrency(0, UGX), KES);
t("wallets", "MTN at Ugandan bureau = UGX", M.types.walletCurrency(1, UGX), UGX);
t("wallets", "a Kenyan bureau's network list hides MTN (UGX)", M.types.MOBILE_MONEY_PROVIDERS.filter(p => M.types.isCurrencyAllowed(KES, M.types.walletCurrency(p.value, KES))).map(p => p.label), ["M-Pesa", "Airtel Money"]);

// ---------- 4. Showing money
t("formatting", "web UGX: no decimals", W.api.formatMoney(1800000, UGX), "UGX 1,800,000");
t("formatting", "web USD: cents", W.api.formatMoney(12.5, USD), "USD 12.50");
t("formatting", "web negative keeps its minus", W.api.formatMoney(-5000, UGX), "UGX -5,000");
t("formatting", "web unknown/empty amount is 0", W.api.formatMoney(undefined, KES), "KES 0");
t("formatting", "mobile negative keeps its minus", M.types.formatCurrency(-1000, KES).startsWith("-"), true);
t("formatting", "mobile NaN shows 0", M.types.formatCurrency(NaN, USD).includes("0.00"), true);
t("formatting", "currency code for every currency (web)", [KES, USD, UGX, EUR].map(W.api.currencyCode), ["KES", "USD", "UGX", "EUR"]);
t("formatting", "currency code for every currency (mobile)", [KES, USD, UGX, EUR].map(M.types.currencyCode), ["KES", "USD", "UGX", "EUR"]);

// ---------- 5. Totals never mix currencies
const rows = [{ a: 1000, c: KES }, { a: 2000000, c: UGX }, { a: 500, c: KES }, { a: 0, c: USD }];
t("totals", "sumByCurrency keeps KES and UGX apart, home first, zero dropped", M.types.sumByCurrency(rows, r => r.a, r => r.c, UGX), [{ currency: UGX, total: 2000000 }, { currency: KES, total: 1500 }]);
t("totals", "no totals → a zero in the home currency", M.types.formatTotals([], UGX).includes("0.00"), true);
t("totals", "client balance rows hide empty KES/USD for a UGX client", M.types.balanceRowsFrom({ balanceKES: 0, balanceUSD: 0, otherBalances: [{ currency: UGX, currencyCode: "UGX", balance: 750000 }] }).map(r => r.code), ["UGX"]);
t("totals", "…but can show them when asked", M.types.balanceRowsFrom({ otherBalances: [] }, true).map(r => r.code), ["KES", "USD"]);

// ---------- 6. Dates on the bureau's day (01:30 Nairobi, 9 Nov)
both("dates", "today", W.dates.localDate(), M.dates.localDate(), "2026-11-09");
both("dates", "first of this month", W.dates.localDate(new Date(2026, 10, 1)), M.dates.localDate(new Date(2026, 10, 1)), "2026-11-01");
both("dates", "last day of the year", W.dates.localDate(new Date(2026, 11, 31, 23, 59)), M.dates.localDate(new Date(2026, 11, 31, 23, 59)), "2026-12-31");
t("dates", "API times with Z show local time (mobile formatDateTime)", M.types.formatDateTime("2026-11-08T20:07:05Z").includes("11:07"), true);
t("dates", "empty/invalid dates show a dash, not 'Invalid Date'", [M.types.formatDate(""), M.types.formatDate("not-a-date")], ["—", "—"]);

// ---------- 7. Printing and sharing are safe
t("print", "HTML in a client name is escaped", W.print.escapeHtml(`<img src=x onerror="alert(1)">`), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
t("print", "null prints as empty, not 'null'", W.print.escapeHtml(null), "");
const msg = W.wa.buildTransactionMessage({ clientName: "Amina", type: "Credit", amount: W.wa.fmt(1500), currency: "KES", balance: W.wa.fmt(-200), balanceCurrency: "KES", code: "TXN-1", description: "Deposit", date: "9 Nov" });
t("sharing", "WhatsApp message has no undefined/NaN", /undefined|NaN/.test(msg), false);
t("sharing", "credit reads 'credited to'", msg.includes("KES 1,500.00 has been credited to"), true);
t("sharing", "negative balance keeps its minus", msg.includes("KES -200.00"), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fails.length) console.log("\nFAILURES:\n" + fails.join("\n"));
process.exitCode = fail ? 1 : 0;
