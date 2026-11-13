// Line audit W10: the sign-in token lasts an hour. The super-admin screens read the reply as JSON
// before checking for 401; the API's 401 has an empty body, so they reported "Request failed with
// status 401" and never refreshed. Receipt, invoice PDF, statement and CSV downloads bypassed the
// refresh entirely. After the first hour all of these failed until the user signed out and in.
const store = {}; global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => store[k] = String(v), removeItem: k => delete store[k] };
global.window = { localStorage: global.localStorage, location: { href: "", protocol: "https:" }, dispatchEvent() {} };
global.document = { cookie: "" };
store["sariff_auth"] = JSON.stringify({ token: "expired", refreshToken: "r1", user: { id: "u1", role: 0, whatsAppNumber: "+254700000001" }, expiresAt: "" });

global.fetch = async (url, opts = {}) => {
  const auth = (opts.headers || {})["Authorization"] || (opts.headers && opts.headers.get && opts.headers.get("Authorization")) || "";
  if (url.endsWith("/api/auth/refresh"))
    return { ok: true, status: 200, json: async () => ({ success: true, message: "ok", data: { accessToken: "fresh", refreshToken: "r2", role: 0, name: "Platform", code: "SA-1", expiresAt: "" } }) };
  if (auth !== "Bearer fresh")   // what ASP.NET's JWT check sends: 401, empty body
    return { ok: false, status: 401, json: async () => { throw new SyntaxError("Unexpected end of JSON input"); }, blob: async () => new Blob([]), text: async () => "" };
  if (url.includes("/receipt") || url.includes("/pdf") || url.includes("/export") || url.includes("/statement/text"))
    return { ok: true, status: 200, blob: async () => new Blob(["%PDF-1.4 receipt"]), json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({ success: true, message: "ok", data: { totalCompanies: 3 } }) };
};

const SA = require("./web/superadmin-api");
const api = require("./web/api");
let pass = 0; const fails = [];
const check = (name, ok, detail) => ok ? pass++ : fails.push(`[expiry] ${name}: ${detail}`);
const reset = () => { store["sariff_auth"] = JSON.stringify({ token: "expired", refreshToken: "r1", user: { id: "u1", role: 0, whatsAppNumber: "+254700000001" }, expiresAt: "" }); };
(async () => {
  const d = await SA.getDashboard();
  check("super admin dashboard after an hour", d.success === true && d.data && d.data.totalCompanies === 3, JSON.stringify(d));

  reset();
  try { const b = await api.downloadTransactionReceipt("t1"); check("portal receipt after an hour", b && b.size > 0, "empty"); }
  catch (e) { check("portal receipt after an hour", false, e.message); }

  reset();
  try { const b = await api.downloadInvoicePdf("i1"); check("invoice PDF after an hour", b && b.size > 0, "empty"); }
  catch (e) { check("invoice PDF after an hour", false, e.message); }

  reset();
  try { const b = await api.exportTransactionsCsv(); check("portal CSV export after an hour", b && b.size > 0, "empty"); }
  catch (e) { check("portal CSV export after an hour", false, e.message); }

  reset();
  const a = await api.exportAuditLogs();
  check("audit log export after an hour", !!a && a.size > 0, String(a));

  console.log(`${pass} passed, ${fails.length} failed` + (fails.length ? "\n\nFAILURES:\n" + fails.join("\n") : ""));
  if (fails.length) process.exitCode = 1;
})();
