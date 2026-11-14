// Two browser tabs share one stored sign-in. Line audit W1: when both hit an expired token,
// the API accepts the refresh token once; the losing tab must pick up the winner's new token,
// not sign everyone out.
const store = {}; global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => store[k] = String(v), removeItem: k => delete store[k] };
global.window = { localStorage: global.localStorage, location: { href: "" }, dispatchEvent() {} };
global.document = { cookie: "" };
const api = require("./web/api");

const old = { token: "old-access", refreshToken: "shared-refresh", user: { role: 1, companyId: "c1" }, expiresAt: "" };
store["sariff_auth"] = JSON.stringify(old);

let refreshCalls = 0;
global.fetch = async (url, opts) => {
  const auth = (opts.headers || {})["Authorization"] || "";
  if (url.endsWith("/api/auth/refresh")) {
    refreshCalls++;
    // The other tab won the race: its refresh succeeded, so ours is refused, and a moment
    // later it stores its new token (as setStoredAuth does).
    setTimeout(() => { store["sariff_auth"] = JSON.stringify({ ...old, token: "new-access", refreshToken: "new-refresh" }); }, 300);
    return { ok: false, status: 400, json: async () => ({ success: false, message: "Invalid or expired refresh token", data: null }) };
  }
  if (auth === "Bearer new-access") return { ok: true, status: 200, json: async () => ({ success: true, message: "ok", data: 42 }) };
  return { ok: false, status: 401, json: async () => ({ success: false, message: "expired", data: null }) };
};

(async () => {
  const r = await api.apiRequest("/api/dashboard");
  const stillSignedIn = !!store["sariff_auth"];
  const ok = r.success === true && r.data === 42 && stillSignedIn && window.location.href !== "/login";
  console.log(ok ? "1 passed, 0 failed" : `0 passed, 1 failed\n\nFAILURES:\n[tabs] the tab that lost the refresh race signed out: success=${r.success} signedIn=${stillSignedIn} href=${window.location.href}`);
  process.exitCode = ok ? 0 : 1;
})();
