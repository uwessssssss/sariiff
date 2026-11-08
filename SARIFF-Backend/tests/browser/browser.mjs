// SARIFF browser test: a real Chromium uses the built web app against a live API.
//   node tests/browser/browser.mjs <web-url> <api-log> <e2e-state.json> <screenshot-dir>
// Runs after tests/e2e/e2e.mjs, which creates the Ugandan bureau, wallets and client used here.
// For every page it fails on: a crash (page error), a console error, the error screen,
// or broken values on screen (NaN, undefined, Invalid Date, [object Object]).
import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const WEB = process.argv[2] || "http://127.0.0.1:3000";
const LOG = process.argv[3];
const S = JSON.parse(readFileSync(process.argv[4], "utf8"));
const SHOTS = process.argv[5] || "/tmp/sariff-shots";
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n        ${String(detail).slice(0, 600)}`}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLen = () => readFileSync(LOG, "utf8").length;
async function codeFor(phone, afterLen) {
  const re = new RegExp(`Message to "?${phone.replace(/[+]/g, "\\+")}"?: "?Sarif: Your verification code is (\\d{6})`, "g");
  for (let i = 0; i < 60; i++) {
    const all = [...readFileSync(LOG, "utf8").slice(afterLen).matchAll(re)];
    if (all.length) return all[all.length - 1][1];
    // A second sign-in within a minute reuses the code just sent (no new SMS).
    if (i >= 12) { const any = [...readFileSync(LOG, "utf8").matchAll(re)]; if (any.length) return any[any.length - 1][1]; }
    await sleep(250);
  }
  return null;
}

const BAD = /\bNaN\b|\bundefined\b|Invalid Date|\[object Object\]|Something went wrong|Application error/;
const IGNORE_CONSOLE = /favicon|Download the React DevTools|\[Fast Refresh\]|Failed to load resource/i; // failed requests are reported with their address below
const EXPECTED_HTTP = /favicon/;

function watch(page) {
  const errs = [];
  page.on("pageerror", (e) => errs.push(`page error: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !IGNORE_CONSOLE.test(m.text()) && errs.push(`console: ${m.text()}`));
  page.on("response", async (r) => {
    if (r.status() < 400 || EXPECTED_HTTP.test(r.url())) return;
    let body = ""; try { body = (await r.text()).slice(0, 200); } catch {}
    if (/Please wait \d+ seconds/.test(body)) return; // the code cooldown; signIn waits it out on purpose
    errs.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, "")} ${body}`);
  });
  return errs;
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  // wait until loaders stop spinning (max 10 s)
  for (let i = 0; i < 40; i++) {
    if ((await page.locator(".animate-spin").count()) === 0) break;
    await sleep(250);
  }
  await sleep(400);
}

async function screen(page, errs, name, { mustHave = [], dump = true } = {}) {
  await settle(page);
  const text = await page.locator("body").innerText().catch(() => "");
  await page.screenshot({ path: `${SHOTS}/${name.replace(/[^a-z0-9]+/gi, "_")}.png`, fullPage: true }).catch(() => {});
  if (dump) console.log(`        ┌ ${name} — what is on screen:\n        │ ${text.replace(/\s*\n\s*/g, " | ").slice(0, 900)}\n        └`);
  const bad = text.match(BAD);
  check(`${name}: no broken values on screen`, !bad, bad && `found "${bad[0]}" near: …${text.slice(Math.max(0, bad.index - 120), bad.index + 80).replace(/\n/g, " ")}…`);
  check(`${name}: no crash or console error`, errs.length === 0, errs.join("\n        "));
  errs.length = 0;
  for (const m of mustHave) check(`${name}: shows "${m}"`, text.includes(m), `not found`);
  return text;
}

async function noSideScroll(page, name) {
  const [sw, w] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  check(`${name}: fits the phone screen (no sideways scroll)`, sw <= w + 1, `page is ${sw}px wide on a ${w}px screen`);
}

// The API allows 10 sign-ins a minute per address (every test runs from 127.0.0.1);
// the e2e test just used about 5. Keep under the limit instead of tripping it.
const signIns = Array(6).fill(Date.now());
async function paceSignIn() {
  for (;;) {
    const recent = signIns.filter((t) => Date.now() - t < 61000);
    if (recent.length < 8) break;
    await sleep(61000 - (Date.now() - recent[0]) + 200);
  }
  signIns.push(Date.now());
}

async function signIn(page, errs, { code, phone, password }, label) {
  await paceSignIn();
  await page.goto(`${WEB}/login`);
  await settle(page);
  await page.fill("#code", code);
  await page.fill("#phone", phone);
  await page.fill("#password", password);
  let mark = logLen();
  await page.locator('form button[type="submit"]').first().click();
  // Same phone signed in less than a minute ago (the API test did): wait it out, like a person would.
  const wait = await page.getByText(/Please wait (\d+) seconds/).first().textContent({ timeout: 4000 }).catch(() => null);
  if (wait) {
    const secs = Number(wait.match(/(\d+) seconds/)[1]);
    console.log(`        (${label}: the API asks to wait ${secs} s between codes to one phone — waiting)`);
    await sleep((secs + 2) * 1000);
    mark = logLen();
    await page.locator('form button[type="submit"]').first().click();
  }
  const otpBox = page.locator('input[aria-label="Digit 1 of 6"]');
  const landed = page.waitForURL(/\/(office|admin|client)(\/|$)/, { timeout: 30000 }).then(() => "in").catch(() => "no");
  const asked = otpBox.waitFor({ timeout: 30000 }).then(() => "otp").catch(() => "no");
  const first = await Promise.race([landed, asked]);
  if (first === "otp" || (await otpBox.count())) {
    const otp = await codeFor(phone, mark);
    check(`${label}: SMS code screen appears and a code was sent`, !!otp);
    if (!otp) return false;
    for (let i = 0; i < 6; i++) await page.locator(`input[aria-label="Digit ${i + 1} of 6"]`).fill(otp[i]);
    await page.waitForURL(/\/(office|admin|client)(\/|$)/, { timeout: 30000 }).catch(() => {});
  }
  const ok = /\/(office|admin|client)(\/|$)/.test(new URL(page.url()).pathname);
  check(`${label}: signs in through the login page`, ok, `still at ${page.url()} — ${(await page.locator("body").innerText()).slice(0, 300)}`);
  return ok;
}

// The currency printed next to a wallet name (looks up through the parent elements).
async function currencyNear(page, name) {
  return page.evaluate((name) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (!n.textContent.includes(name)) continue;
      let el = n.parentElement;
      for (let i = 0; i < 8 && el; i++, el = el.parentElement) {
        const m = el.innerText.match(/\b(KES|UGX|USD|KSh|USh)\b/);
        if (m) return m[1];
      }
    }
    return null;
  }, name);
}

(async () => {
  console.log(`SARIFF browser test — ${WEB}\n`);
  const browser = await chromium.launch();
  const desk = { viewport: { width: 1366, height: 860 }, timezoneId: "Africa/Nairobi", locale: "en-KE" };

  // ---------- login page itself
  {
    const ctx = await browser.newContext(desk), page = await ctx.newPage(), errs = watch(page);
    await page.goto(`${WEB}/login`);
    await screen(page, errs, "Login page", { mustHave: ["Phone number"] });
    await page.fill("#code", "AFB-2026-0001");
    await page.fill("#phone", "+254711111111");
    await page.fill("#password", "wrong-password");
    await paceSignIn();
    await page.locator('form button[type="submit"]').first().click();
    await settle(page);
    const t = await page.locator("body").innerText();
    check("Login page: wrong password shows an error and stays on login", new URL(page.url()).pathname === "/login" && /incorrect|invalid|wrong|failed|check/i.test(t), t.slice(0, 300));
    errs.length = 0; // the 401 is expected
    await page.goto(`${WEB}/office/dashboard`);
    await page.waitForURL(/\/login/, { timeout: 15000 }).catch(() => {});
    check("Signed-out visitor sent to /office is sent back to login", /\/login/.test(page.url()), page.url());
    await ctx.close();
  }

  // ---------- Ugandan office: every tab
  {
    const ctx = await browser.newContext(desk), page = await ctx.newPage(), errs = watch(page);
    if (await signIn(page, errs, S.ugOffice, "Ugandan office")) {
      await screen(page, errs, "Office dashboard", { mustHave: ["UGX"] });
      const tabs = [
        ["clients", "Office clients", ["Test Amina", "600,000"]],
        ["cash", "Office cash at hand", ["UGX"]],
        ["banks", "Office bank accounts", []],
        ["mpesa", "Office mobile money", ["Test Mpesa Agent", "Test Mtn Agent"]],
        ["expenses", "Office expenses", []],
        ["exchange", "Office exchange", []],
        ["reconciliation", "Office reconciliation", []],
        ["invoices", "Office invoices", []],
        ["reports", "Office reports", []],
        ["settings", "Office settings", []],
      ];
      for (const [path, name, must] of tabs) {
        await page.goto(`${WEB}/office/${path}`);
        await screen(page, errs, name, { mustHave: must });
        if (path === "mpesa") {
          const mp = await currencyNear(page, "Test Mpesa Agent"), mtn = await currencyNear(page, "Test Mtn Agent");
          check("Mobile money page: the M-Pesa wallet is shown in KES", mp === "KES" || mp === "KSh", `shown as ${mp}`);
          check("Mobile money page: the MTN wallet is shown in UGX", mtn === "UGX" || mtn === "USh", `shown as ${mtn}`);
        }
      }
      // sidebar clicks switch tabs without a reload
      await page.goto(`${WEB}/office/dashboard`);
      await settle(page);
      await page.getByRole("link", { name: "Clients" }).first().click();
      await screen(page, errs, "Office: Clients opened from the sidebar", { mustHave: ["Test Amina"], dump: false });
      check("Sidebar click updates the address bar", /\/office\/clients/.test(page.url()), page.url());
      // opening the client (statement)
      const row = page.getByText("Test Amina").first();
      if (await row.count()) {
        await row.click().catch(() => {});
        await screen(page, errs, "Office: client opened", { dump: true });
        await page.keyboard.press("Escape").catch(() => {});
      }
    }
    await ctx.close();
  }

  // ---------- Super admin
  {
    const ctx = await browser.newContext(desk), page = await ctx.newPage(), errs = watch(page);
    if (await signIn(page, errs, { code: "SA-2026-001", phone: "+254700000000", password: "Test@123" }, "Super admin")) {
      await page.goto(`${WEB}/admin/dashboard`);
      await screen(page, errs, "Super admin dashboard");
    }
    await ctx.close();
  }

  // ---------- Client, code + password
  {
    const ctx = await browser.newContext(desk), page = await ctx.newPage(), errs = watch(page);
    if (await signIn(page, errs, S.client, "Client")) {
      await screen(page, errs, "Client dashboard", { mustHave: ["600,000", "E2E deposit"] });
      const st = page.getByRole("button", { name: /statement/i }).first();
      if (await st.count()) {
        await st.click();
        await screen(page, errs, "Client statement");
      } else check("Client dashboard: has a Statement button", false, "no button named Statement");
    }
    await ctx.close();
  }

  // ---------- Client, phone login (one number, two bureaus)
  {
    const ctx = await browser.newContext(desk), page = await ctx.newPage(), errs = watch(page);
    await page.goto(`${WEB}/login`);
    await settle(page);
    await page.getByRole("tab", { name: "Phone number" }).click();
    await page.fill("#pl-phone", S.client.phone);
    await paceSignIn();
    const mark = logLen();
    await page.getByRole("button", { name: "Send code" }).click();
    const otp = await codeFor(S.client.phone, mark);
    check("Phone login: an SMS code is sent", !!otp);
    if (otp) {
      await page.locator("#pl-code").waitFor({ timeout: 15000 });
      await page.fill("#pl-code", otp);
      await page.getByRole("button", { name: "Continue" }).click();
      await settle(page);
      const items = await page.locator("ul li button").allInnerTexts();
      check("Phone login: both linked bureaus are listed", items.length === 2, JSON.stringify(items));
      await screen(page, errs, "Phone login: choose bureau", { mustHave: ["Test Kampala Bureau"] });
      await page.locator("ul li button", { hasText: "Test Kampala Bureau" }).click();
      await page.waitForURL(/\/client/, { timeout: 30000 }).catch(() => {});
      await screen(page, errs, "Phone login: Kampala client dashboard", { mustHave: ["600,000"] });
    }
    await ctx.close();
  }

  // ---------- On a phone (iPhone 13 size)
  {
    const ctx = await browser.newContext({ ...devices["iPhone 13"], timezoneId: "Africa/Nairobi" });
    const page = await ctx.newPage(), errs = watch(page);
    await page.goto(`${WEB}/login`);
    await screen(page, errs, "Phone screen: login", { dump: false });
    await noSideScroll(page, "Phone screen: login");
    if (await signIn(page, errs, S.ugOffice, "Phone screen: office")) {
      for (const p of ["dashboard", "clients", "mpesa", "reports"]) {
        await page.goto(`${WEB}/office/${p}`);
        await screen(page, errs, `Phone screen: office ${p}`, { dump: false });
        await noSideScroll(page, `Phone screen: office ${p}`);
      }
    }
    await ctx.close();
    const c2 = await browser.newContext({ ...devices["iPhone 13"], timezoneId: "Africa/Nairobi" });
    const p2 = await c2.newPage(), e2 = watch(p2);
    if (await signIn(p2, e2, S.client, "Phone screen: client")) {
      await screen(p2, e2, "Phone screen: client dashboard", { dump: false });
      await noSideScroll(p2, "Phone screen: client dashboard");
    }
    await c2.close();
  }

  await browser.close();
  console.log(`\nBROWSER: ${pass} passed, ${fail} failed   (screenshots: ${SHOTS})`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log(`FAIL  browser test crashed\n        ${e.stack}`);
  console.log(`\nBROWSER: ${pass} passed, ${fail + 1} failed`);
  process.exit(1);
});
