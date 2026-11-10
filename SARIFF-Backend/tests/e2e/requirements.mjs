// SARIFF requirements check — every feature the README lists (and the ones the API has
// beyond it), called with the right role, plus the product decisions recorded for Sarif.
//   node tests/e2e/requirements.mjs <api-url> <api-log> <e2e-state.json>
// Runs after e2e.mjs + accuracy.mjs (uses the Ugandan bureau, its accounts and invoice).
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { client, reporter, Cur, list } from "../lib/sarif.mjs";

const BASE = process.argv[2], LOG = process.argv[3], S = JSON.parse(readFileSync(process.argv[4], "utf8"));
const { api, login } = client(BASE, LOG);
const { check, done } = reporter("REQUIREMENTS");

(async () => {
  console.log(`SARIFF requirements check — ${BASE}\n`);
  const UG = await login(S.ugOffice);
  const KE = await login({ code: "AFB-2026-0001", phone: "+254711111111", password: "Test@123" });
  const SA = await login({ code: "SA-2026-001", phone: "+254700000000", password: "Test@123" });
  const CLr = await api("POST", "/api/auth/login", null, { code: S.client.code, phoneNumber: S.client.phone, password: S.client.password });
  const CL = CLr.data?.accessToken;
  if (!check("Sign-in works for super admin, office (with SMS code) and client (no code)", UG && KE && SA && CL && !CLr.data?.requiresOtp)) return done();

  const wallets = list((await api("GET", "/api/mpesa", UG)).data);
  const MTN = wallets.find((w) => w.agentNumber === "E2E-MTN-1")?.id;
  const tx = list((await api("GET", "/api/transaction?page=1&pageSize=5", UG)).data)[0]?.id;
  const ptx = list((await api("GET", "/api/portal/transactions?page=1&pageSize=5", CL)).data)[0];
  const recs = list((await api("GET", "/api/reconciliation", UG)).data);
  const exps = list((await api("GET", "/api/expense", UG)).data);
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);

  // [feature, token, path]  — README section first, then the API's extra features
  const features = [
    ["Companies: list", SA, "/api/company"], ["Companies: details", SA, `/api/company/${S.ugOffice.companyId}`], ["Companies: summaries", SA, "/api/company/summaries"],
    ["Clients: list", UG, "/api/client"], ["Clients: details", UG, `/api/client/${S.client.id}`], ["Clients: statistics", UG, "/api/client/stats"], ["Clients: statement", UG, `/api/client/${S.client.id}/statement`], ["Clients: lookup", UG, "/api/client/lookup?query=Amina"],
    ["Transactions: list", UG, "/api/transaction"], ["Transactions: details", UG, `/api/transaction/${tx}`], ["Transactions: today's summary", UG, "/api/transaction/today"], ["Transactions: recent", UG, "/api/transaction/recent"],
    ["Bank: list", UG, "/api/bank"], ["Bank: details", UG, `/api/bank/${S.bankId}`], ["Bank: statistics", UG, "/api/bank/stats"], ["Bank: statement", UG, `/api/bank/${S.bankId}/statement`],
    ["Mobile money: list", UG, "/api/mpesa"], ["Mobile money: details", UG, `/api/mpesa/${MTN}`], ["Mobile money: statistics", UG, "/api/mpesa/stats"], ["Mobile money: statement", UG, `/api/mpesa/${MTN}/statement`],
    ["Cash: list", UG, "/api/cash"], ["Cash: statistics", UG, "/api/cash/stats"], ["Cash: statement", UG, `/api/cash/statement/${Cur.UGX}`], ["Cash: by currency", UG, `/api/cash/currency/${Cur.UGX}`],
    ["Expenses: categories", UG, "/api/expense/category"], ["Expenses: list", UG, "/api/expense"], ["Expenses: statistics", UG, "/api/expense/stats"], ...(exps[0] ? [["Expenses: details", UG, `/api/expense/${exps[0].id}`]] : []),
    ["Exchange rates: current (README route)", UG, "/api/exchange-rate/current"], ["Exchange rates: history (README route)", UG, "/api/exchange-rate/history"],
    ["Exchange: rate", UG, `/api/exchange/rate?currency=${Cur.USD}`], ["Exchange: rate history", UG, "/api/exchange/rate/history"], ["Exchange: float", UG, "/api/exchange/float"], ["Exchange: float movements", UG, "/api/exchange/float/movements"],
    ["Exchange: trades", UG, "/api/exchange/transactions"], ["Exchange: today's daily sheet", UG, "/api/exchange/daily/today"], ["Exchange: daily summaries", UG, "/api/exchange/daily/summaries"], ["Exchange: profit report", UG, "/api/exchange/reports/profit"],
    ["Exchange: large-transaction report", UG, "/api/exchange/reports/large-transactions"], ["Exchange: client report", UG, `/api/exchange/reports/client/${S.client.id}`], ["Exchange: USD position", UG, "/api/exchange/position/usd"], ["Exchange: float alerts", UG, "/api/exchange/alerts"],
    ["Invoices: list", UG, "/api/invoice"], ["Invoices: details", UG, `/api/invoice/${S.invoiceId}`], ["Invoices: PDF", UG, `/api/invoice/${S.invoiceId}/pdf`],
    ["Reconciliation: list", UG, "/api/reconciliation"], ...(recs[0] ? [["Reconciliation: details", UG, `/api/reconciliation/${recs[0].id}`]] : []), ["Reconciliation: accounts", UG, "/api/reconciliation/accounts"],
    ["Reconciliation: account transactions", UG, `/api/reconciliation/account/0/${S.tillId}/transactions`], ["Reconciliation: account summary", UG, `/api/reconciliation/account/0/${S.tillId}/summary`], ["Reconciliation: expected balance", UG, `/api/reconciliation/expected-balance?accountType=0&accountId=${S.tillId}`],
    ["Reports: daily", UG, `/api/report/daily?date=${today}`], ["Reports: transactions", UG, "/api/report/transactions"], ["Reports: client balances", UG, "/api/report/client-balances"], ["Reports: account summary", UG, "/api/report/account-summary"],
    ["Dashboard", UG, "/api/dashboard"], ["Dashboard: currencies", UG, "/api/dashboard/currencies"], ["Dashboard: company", UG, "/api/dashboard/company"],
    ["Admin: dashboard", SA, "/api/admin/dashboard"], ["Admin: extended dashboard", SA, "/api/admin/dashboard/extended"], ["Admin: companies with stats", SA, "/api/admin/companies"], ["Admin: company details", SA, `/api/admin/companies/${S.ugOffice.companyId}/details`],
    ["Admin: system health", SA, "/api/admin/system/health"], ["Admin: security overview", SA, "/api/admin/security/overview"], ["Admin: security alerts", SA, "/api/admin/security/alerts"], ["Admin: IP whitelist", SA, "/api/admin/security/ip-whitelist"],
    ["Admin: financial overview", SA, "/api/admin/financials/overview"], ["Admin: payment history", SA, "/api/admin/financials/payments"], ["Admin: analytics", SA, "/api/admin/analytics/overview"],
    ["Admin: audit log", SA, "/api/admin/audit-logs"], ["Admin: extended audit log", SA, "/api/admin/audit-logs/extended"], ["Admin: audit log export", SA, "/api/admin/audit-logs/export"], ["Admin: login history", SA, "/api/admin/login-history"], ["Admin: system logs", SA, "/api/admin/system-logs"],
    ["Portal: dashboard", CL, "/api/portal/dashboard"], ["Portal: profile", CL, "/api/portal/profile"], ["Portal: transactions", CL, "/api/portal/transactions"], ...(ptx ? [["Portal: transaction", CL, `/api/portal/transactions/${ptx.id}`], ["Portal: receipt", CL, `/api/portal/transactions/${ptx.id}/receipt`]] : []),
    ["Portal: statement", CL, "/api/portal/statement"], ["Portal: statement PDF", CL, "/api/portal/statement/pdf"], ["Portal: statement text", CL, "/api/portal/statement/text"], ["Portal: CSV export", CL, "/api/portal/transactions/export"],
    ["Portal: alerts", CL, "/api/portal/alerts"], ["Portal: unread alerts", CL, "/api/portal/alerts/unread-count"], ["Portal: analytics", CL, "/api/portal/analytics"],
    ["Trusted devices", UG, "/api/trusted-devices"], ["Balance alerts", UG, "/api/balance-alerts"], ["Transaction PIN status", UG, "/api/transaction-pin/status"], ["Phone login switch", null, "/api/identity/enabled"],
  ];
  const broken = [];
  for (const [name, tok, path] of features) {
    const r = await api("GET", path, tok);
    const ok = r.status === 200 && (r.success !== false);
    if (!ok) broken.push(`${name} (${path}) → ${r.status} ${r.message || ""}`);
  }
  check(`All ${features.length} features answer with real data`, broken.length === 0, broken.join("\n        "));

  // ---------- recorded product decisions
  const det = await api("GET", `/api/admin/companies/${S.ugOffice.companyId}/details`, SA);
  check("Base currency is per bureau, set by the super admin (Ugandan bureau = UGX)", /"baseCurrency":\s*2|"baseCurrencyCode":\s*"UGX"/.test(det.text || ""), (det.text || "").slice(0, 200));
  const keCur = await api("GET", "/api/dashboard/currencies", KE), ugCur = await api("GET", "/api/dashboard/currencies", UG);
  check("Kenyan office's currencies: KES home, no UGX unless it holds UGX", /"KES"/.test(keCur.text) && !/"UGX"/.test(keCur.text), keCur.text?.slice(0, 300));
  check("Ugandan office's currencies include KES (it needs it)", /"KES"/.test(ugCur.text) && /"UGX"/.test(ugCur.text), ugCur.text?.slice(0, 300));
  const air = await api("POST", "/api/mpesa", UG, { agentName: "Test Airtel Agent", phoneNumber: "+256752000111", agentNumber: "REQ-AIR-1", storeNumber: null, agentType: 0, openingBalance: 0, provider: 2 });
  check("Mobile money covers Airtel Money (Ugandan Airtel wallet holds UGX)", air.success && (air.data?.currency === Cur.UGX), `${air.message} ${JSON.stringify(air.data && { currency: air.data.currency, provider: air.data.provider })}`);
  const fin = await api("GET", "/api/admin/financials/overview", SA);
  check("Subscriptions are billed in KES for every bureau (also Ugandan ones)", fin.status === 200 && !/"currency(Code)?":\s*"UGX"/i.test(fin.text || ""), (fin.text || "").slice(0, 300));
  const smsLine = readFileSync(LOG, "utf8").match(/Message to [^\n]*/)?.[0] || "";
  check("SMS texts say \"Sarif\"", /Sarif: Your verification code/.test(smsLine), smsLine);

  // ---------- documents the client receives
  async function pdfText(path, tok) {
    const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${tok}` } });
    const buf = Buffer.from(await res.arrayBuffer());
    const f = `/tmp/sarif-req-${Date.now()}.pdf`;
    writeFileSync(f, buf);
    try { return { status: res.status, type: res.headers.get("content-type"), text: execFileSync("pdftotext", ["-layout", f, "-"], { encoding: "utf8" }) }; }
    catch (e) { return { status: res.status, type: res.headers.get("content-type"), text: "", err: e.message }; }
  }
  const cbal = (await api("GET", `/api/client/${S.client.id}`, UG)).data;
  const ugx = (cbal?.otherBalances || []).find((b) => b.currency === Cur.UGX)?.balance;
  const pdf = await pdfText("/api/portal/statement/pdf", CL);
  check("Statement PDF downloads as a PDF", pdf.status === 200 && /pdf/i.test(pdf.type || ""), `${pdf.status} ${pdf.type} ${pdf.err || ""}`);
  const want = ugx?.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  check(`Statement PDF shows the client's real closing balance (UGX ${want})`, !!want && pdf.text.replace(/\s+/g, " ").includes(want), pdf.text.slice(0, 400));
  check("Statement PDF has no zero-total bug (totals not all 0.00)", !/Total[^\n]*\b0\.00\b[^\n]*\b0\.00\b/i.test(pdf.text) || /[1-9]\d{0,2}(,\d{3})+/.test(pdf.text), pdf.text.slice(0, 300));
  check("Statement PDF is branded Sarif (not SARIFF)", /Sarif/.test(pdf.text) && !/SARIFF/.test(pdf.text), pdf.text.slice(0, 200));
  if (ptx) {
    const rc = await fetch(BASE + `/api/portal/transactions/${ptx.id}/receipt`, { headers: { Authorization: `Bearer ${CL}` } });
    check("Receipt downloads for a transaction", rc.status === 200 && (await rc.arrayBuffer()).byteLength > 200, `${rc.status}`);
  }
  const ipdf = await pdfText(`/api/invoice/${S.invoiceId}/pdf`, UG);
  const inv = (await api("GET", `/api/invoice/${S.invoiceId}`, UG)).data;
  const invTotal = inv?.total?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  check(`Invoice PDF shows the invoice total (${invTotal})`, !!invTotal && ipdf.text.includes(invTotal), ipdf.text.slice(0, 400));
  check("Invoice PDF uses the invoice's currency (UGX), not KES", /UGX/.test(ipdf.text) && !/KES/.test(ipdf.text), ipdf.text.slice(0, 300));
  done();
})().catch((e) => { check("requirements check crashed", false, e.stack); done(); });
