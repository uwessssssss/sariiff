// SARIFF documents test: the PDFs a user actually downloads, checked for the right numbers.
//   node tests/browser/documents.mjs <web-url> <api-url> <api-log> <e2e-state.json> <out-dir>
// The web app builds invoices and statements in the browser (jsPDF), so they are tested by
// clicking the same buttons a person clicks, saving the file and reading its text.
import { readFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const [WEB, API, LOG, STATE, OUT] = process.argv.slice(2);
const S = JSON.parse(readFileSync(STATE, "utf8"));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${ok || !d ? "" : `\n        ${String(d).slice(0, 500)}`}`); return ok; };
const money = (n, dp = 2) => Number(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: 2 });
const flat = (t) => t.replace(/\s+/g, " ");

async function codeFor(phone, afterLen) {
  const re = new RegExp(`Message to "?${phone.replace(/[+]/g, "\\+")}"?: "?Sarif: Your verification code is (\\d{6})`, "g");
  for (let i = 0; i < 60; i++) {
    let all = [...readFileSync(LOG, "utf8").slice(afterLen).matchAll(re)];
    if (!all.length && i >= 12) all = [...readFileSync(LOG, "utf8").matchAll(re)];
    if (all.length) return all.at(-1)[1];
    await sleep(250);
  }
  return null;
}
async function signIn(page, { code, phone, password }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(`${WEB}/login`); await page.waitForLoadState("networkidle").catch(() => {});
    await page.fill("#code", code); await page.fill("#phone", phone); await page.fill("#password", password);
    const mark = readFileSync(LOG, "utf8").length;
    await page.locator('form button[type="submit"]').first().click();
    const wait = await page.getByText(/Please wait (\d+) seconds/).first().textContent({ timeout: 3000 }).catch(() => null);
    if (wait) { await sleep((Number(wait.match(/(\d+)/)[1]) + 2) * 1000); continue; }
    const otpBox = page.locator('input[aria-label="Digit 1 of 6"]');
    const got = await Promise.race([
      page.waitForURL(/\/(office|admin|client)(\/|$)/, { timeout: 25000 }).then(() => "in").catch(() => "no"),
      otpBox.waitFor({ timeout: 25000 }).then(() => "otp").catch(() => "no"),
    ]);
    if (got === "otp") {
      const otp = await codeFor(phone, mark);
      if (!otp) return false;
      for (let i = 0; i < 6; i++) await page.locator(`input[aria-label="Digit ${i + 1} of 6"]`).fill(otp[i]);
      await page.waitForURL(/\/(office|admin|client)(\/|$)/, { timeout: 25000 }).catch(() => {});
    }
    if (/\/(office|admin|client)(\/|$)/.test(new URL(page.url()).pathname)) return true;
    await sleep(62000);
  }
  return false;
}
const token = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem("sariff_auth") || "{}").token; } catch { return null; } });
const apiGet = async (page, path) => {
  const t = await token(page);
  const r = await fetch(API + path, { headers: { Authorization: `Bearer ${t}` } });
  return (await r.json().catch(() => ({}))).data;
};
function pdfText(file) {
  try { return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" }); } catch (e) { return `PDFTOTEXT FAILED: ${e.message}`; }
}
async function download(page, click, name) {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }).catch(() => null), click()]);
  if (!dl) return null;
  const file = `${OUT}/${name}`;
  await dl.saveAs(file);
  return { file, suggested: dl.suggestedFilename(), text: pdfText(file) };
}

(async () => {
  console.log(`SARIFF documents test — ${WEB}\n`);
  const browser = await chromium.launch();
  const ctxOpts = { viewport: { width: 1366, height: 860 }, timezoneId: "Africa/Nairobi", locale: "en-KE", acceptDownloads: true };

  // ---------- office: invoice PDF
  {
    const page = await (await browser.newContext(ctxOpts)).newPage();
    if (check("Office signs in", await signIn(page, S.ugOffice))) {
      await page.goto(`${WEB}/office/invoices`); await page.waitForLoadState("networkidle").catch(() => {}); await sleep(1500);
      const inv = await apiGet(page, `/api/invoice/${S.invoiceId}`);
      const btn = page.locator('button[title="Download PDF"]').first();
      if (check("Invoice list shows a Download PDF button", (await btn.count()) > 0)) {
        await btn.click();
        await page.getByText("Bold Red").first().waitFor({ timeout: 10000 }).catch(() => {});
        const d = await download(page, () => page.getByText("Bold Red").first().click(), "invoice.pdf");
        if (check("Choosing a template downloads the invoice PDF", !!d, "no download started")) {
          const t = flat(d.text);
          console.log(`        invoice PDF text: ${t.slice(0, 300)}`);
          check(`Invoice PDF shows the total ${money(inv?.total)}`, !!inv && t.includes(money(inv.total)), `total ${inv?.total}`);
          check(`Invoice PDF shows the subtotal ${money(inv?.subtotal)}`, !!inv && t.includes(money(inv.subtotal)));
          check("Invoice PDF is in the invoice's currency (UGX), not KES", /UGX|USh/.test(t) && !/\bKES\b|\bKSh\b/.test(t), t.slice(0, 200));
          check("Invoice PDF names the client", t.includes("Test Amina"));
          check("Invoice PDF says Sarif, not SARIFF", !/SARIFF/.test(t));
          check("Invoice PDF has no broken values", !/NaN|undefined|Invalid Date|\[object/.test(t), t.match(/NaN|undefined|Invalid Date|\[object[^\]]*\]/)?.[0]);
        }
      }
    }
  }

  // ---------- client: statement PDF
  {
    const page = await (await browser.newContext(ctxOpts)).newPage();
    if (check("Client signs in", await signIn(page, S.client))) {
      await page.waitForLoadState("networkidle").catch(() => {}); await sleep(1500);
      const prof = await apiGet(page, "/api/portal/profile"); // ClientProfileDto: OtherBalances holds UGX
      const ugx = (prof?.otherBalances || []).find((b) => b.currency === 2)?.balance;
      await page.getByRole("button", { name: /^\s*Statements/i }).first().click().catch(() => {});
      await sleep(1500);
      const d = await download(page, () => page.getByRole("button", { name: /Download PDF/i }).first().click(), "statement.pdf");
      if (check("Statements → Download PDF downloads a statement", !!d, "no download started")) {
        const t = flat(d.text);
        console.log(`        statement PDF text: ${t.slice(0, 400)}`);
        check("Statement PDF opens as a real PDF", !/PDFTOTEXT FAILED/.test(d.text), d.text.slice(0, 200));
        check("Statement PDF names the client", t.includes("Test Amina"));
        if (typeof ugx === "number") check(`Statement PDF shows the UGX balance ${money(ugx, 0)}`, t.includes(money(ugx, 0)) || t.includes(money(ugx)), `looked for ${money(ugx)}`);
        else check("Client's UGX balance readable from the portal profile", false, JSON.stringify(prof || {}).slice(0, 200));
        check("Statement PDF totals are not all zero", /[1-9][\d,]*\.\d\d/.test(t), t.slice(0, 200));
        check("Statement PDF says Sarif, not SARIFF", /Sarif/.test(t) && !/SARIFF/.test(t), t.slice(0, 200));
        check("Statement PDF times are East Africa Time (no 'UTC' / 'Z')", !/\bUTC\b|\d\dZ\b/.test(t));
        check("Statement PDF has no broken values", !/NaN|undefined|Invalid Date|\[object/.test(t), t.match(/NaN|undefined|Invalid Date|\[object[^\]]*\]/)?.[0]);
      }
    }
  }
  await browser.close();
  console.log(`\nDOCUMENTS: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log(`FAIL  documents test crashed\n${e.stack}`); console.log(`\nDOCUMENTS: ${pass} passed, ${fail + 1} failed`); process.exit(1); });
