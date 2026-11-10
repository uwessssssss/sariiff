// Shared helpers for the SARIFF test scripts (accuracy, security, performance, design).
import { readFileSync } from "node:fs";

export const Cur = { KES: 0, USD: 1, UGX: 2, EUR: 3 };
export const Acc = { Cash: 0, Bank: 1, Mpesa: 2, Client: 3 };
export const Txn = { Debit: 0, Credit: 1 };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const list = (d) => (Array.isArray(d) ? d : d?.items || d?.Items || d?.data || []);
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function reporter(title) {
  let pass = 0, fail = 0;
  const findings = [];
  const check = (name, ok, detail = "") => {
    ok ? pass++ : fail++;
    if (!ok) findings.push({ name, detail: String(detail).slice(0, 600) });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n        ${String(detail).slice(0, 600)}`}`);
    return ok;
  };
  const done = () => {
    console.log(`\n${title}: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  };
  return { check, done, counts: () => ({ pass, fail }), findings };
}

export function client(base, log) {
  async function api(method, path, token, body, extraHeaders = {}) {
    const headers = { "Content-Type": "application/json", ...extraHeaders };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (method !== "GET" && !("Idempotency-Key" in headers)) headers["Idempotency-Key"] = crypto.randomUUID();
    const t0 = performance.now();
    try {
      const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await res.text();
      let j = null; try { j = JSON.parse(text); } catch {}
      return { status: res.status, ms: performance.now() - t0, headers: res.headers, text, ...(j && typeof j === "object" ? j : {}) };
    } catch (e) {
      return { status: 0, ms: performance.now() - t0, success: false, message: e.message };
    }
  }

  async function codeFor(phone, afterLen) {
    const re = new RegExp(`Message to "?${phone.replace(/[+]/g, "\\+")}"?: "?Sarif: Your verification code is (\\d{6})`, "g");
    for (let i = 0; i < 60; i++) {
      let all = [...readFileSync(log, "utf8").slice(afterLen).matchAll(re)];
      if (!all.length && i >= 12) all = [...readFileSync(log, "utf8").matchAll(re)]; // reused recent code
      if (all.length) return all.at(-1)[1];
      await sleep(250);
    }
    return null;
  }

  // Signs in any role. Office/admin: password then SMS code (read from the API log).
  async function login({ code, phone, password }) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const mark = readFileSync(log, "utf8").length;
      const r = await api("POST", "/api/auth/login", null, { code, phoneNumber: phone, password });
      const wait = /Please wait (\d+) seconds/.exec(r.message || "");
      if (wait) { await sleep((+wait[1] + 2) * 1000); continue; }
      if (r.status === 429) { await sleep(61000); continue; }
      if (r.data?.accessToken) return r.data.accessToken;
      if (!r.success) return null;
      const otp = await codeFor(phone, mark);
      if (!otp) return null;
      const v = await api("POST", "/api/auth/verify-otp", null, { code, phoneNumber: phone, otp });
      if (v.data?.accessToken) return v.data.accessToken;
      if (v.status === 429) { await sleep(61000); continue; }
      return null;
    }
    return null;
  }

  return { api, login, codeFor };
}
