// SARIFF design review: every web screen and every pop-up, desktop + phone.
//   node tests/browser/design.mjs <web-url> <api-log> <e2e-state.json> <out-dir>
// For each screen: a screenshot, an accessibility scan (axe-core, WCAG 2.1 AA), the font
// sizes and colours in use, and every pop-up the screen can open (found automatically:
// it clicks Add / New / Edit / View / Statement / Deposit ... never Delete, Logout,
// Suspend, Save). Each pop-up gets a screenshot, its own scan and a keyboard check:
// focus moves into it, Tab stays inside, Escape closes it. Any script that runs from
// stored data (XSS) is caught. Writes <out-dir>/report.json and prints a summary.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const AXE = readFileSync(require.resolve(process.env.AXE_MODULE || "axe-core/axe.min.js"), "utf8");

const WEB = process.argv[2], LOG = process.argv[3], S = JSON.parse(readFileSync(process.argv[4], "utf8")), OUT = process.argv[5];
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { screens: [], modals: [], xss: [], errors: [] };
let shotNo = 0;
const slug = (s) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60);

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
async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  for (let i = 0; i < 40 && (await page.locator(".animate-spin").count()) > 0; i++) await sleep(250);
  await sleep(500);
}
async function signIn(page, { code, phone, password }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(`${WEB}/login`); await settle(page);
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
    await sleep(62000); // likely the sign-in rate limit
  }
  return false;
}

async function axe(page, selector) {
  await page.evaluate(AXE);
  return page.evaluate(async (sel) => {
    const ctx = sel ? document.querySelector(sel) : document;
    if (!ctx) return [];
    // eslint-disable-next-line no-undef
    const r = await axe.run(ctx, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes.slice(0, 2).map((n) => n.target.join(" ") + " :: " + (n.failureSummary || "").split("\n").slice(1, 2).join("")) }));
  }, selector || null);
}

// Font sizes (weighted by how much text uses them) and the main colours on screen.
async function typeAndColour(page) {
  return page.evaluate(() => {
    const sizes = {}, colours = {};
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      const t = n.textContent.trim();
      if (!t || !n.parentElement) continue;
      const cs = getComputedStyle(n.parentElement);
      if (cs.visibility === "hidden" || cs.display === "none" || n.parentElement.offsetParent === null && cs.position !== "fixed") continue;
      sizes[cs.fontSize] = (sizes[cs.fontSize] || 0) + t.length;
      colours[cs.color] = (colours[cs.color] || 0) + t.length;
    }
    const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
    return { fontSizes: top(sizes), textColours: top(colours).slice(0, 12) };
  });
}

const DIALOG = '[role="dialog"]:visible, [role="alertdialog"]:visible, div.fixed.inset-0:visible';
const INCLUDE = /^(\+\s*)?(add|new|create|record|edit|view|open|details|statement|deposit|withdraw|transfer|buy|sell|exchange|expense|invoice|reconcile|set|fund|top up|convert|change|share|filter|more|manage|settle|opening|closing|alert|pin|history|move|link|start|count)\b/i;
const EXCLUDE = /delete|remove|log ?out|sign ?out|deactivate|suspend|reset|block|void|cancel|close|confirm|save|submit|pay|send|unlink|approve|reject|disable|archive|mark all|download|export|print|csv|pdf|refresh|activate/i;

async function openDialogCount(page) { return page.locator(DIALOG).count(); }

async function closeDialog(page) {
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(350);
  if ((await openDialogCount(page)) === 0) return "escape";
  const btn = page.locator(DIALOG).last().locator('button:has-text("Cancel"), button:has-text("Close"), button[aria-label*="lose" i], button:has-text("×"), button:has-text("✕")').first();
  if (await btn.count()) { await btn.click({ timeout: 2000 }).catch(() => {}); await sleep(350); if ((await openDialogCount(page)) === 0) return "button"; }
  return "stuck";
}

async function modalChecks(page, name, view) {
  const shot = `${String(++shotNo).padStart(3, "0")}-modal-${slug(name)}.jpg`;
  await sleep(400);
  await page.screenshot({ path: `${OUT}/${shot}`, type: "jpeg", quality: 72 }).catch(() => {});
  const info = await page.evaluate((sel) => {
    const els = [...document.querySelectorAll(sel.replace(/:visible/g, ""))].filter((e) => e.offsetParent !== null || getComputedStyle(e).position === "fixed");
    const d = els.at(-1);
    if (!d) return null;
    if (!d.id) d.id = "sarif-audit-dialog";
    const roleEl = d.matches('[role="dialog"],[role="alertdialog"]') ? d : d.querySelector('[role="dialog"],[role="alertdialog"]');
    const title = (d.querySelector("h1,h2,h3")?.textContent || "").trim().slice(0, 80);
    return { id: d.id, hasRole: !!roleEl, ariaModal: roleEl?.getAttribute("aria-modal") === "true", labelled: !!(roleEl && (roleEl.getAttribute("aria-labelledby") || roleEl.getAttribute("aria-label"))), title,
      focusInside: d.contains(document.activeElement) && document.activeElement !== document.body,
      tooTall: d.scrollHeight > window.innerHeight + 4 && getComputedStyle(d).overflowY === "visible" };
  }, DIALOG);
  if (!info) return;
  const a11y = await axe(page, `#${info.id}`);
  // Tab 15 times: does focus leave the pop-up?
  let escaped = false;
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate((id) => { const d = document.getElementById(id); return !!d && d.contains(document.activeElement); }, info.id);
    if (!inside) { escaped = true; break; }
  }
  const closedBy = await closeDialog(page);
  report.modals.push({ view, name, shot, ...info, tabEscapes: escaped, closedBy, axe: a11y });
  console.log(`  ◻ ${name}${info.title ? ` — "${info.title}"` : ""}: ${[!info.hasRole && "no dialog role", info.hasRole && !info.labelled && "no label", !info.focusInside && "focus not moved in", escaped && "Tab leaves it", closedBy !== "escape" && `Escape doesn't close (${closedBy})`, a11y.length && `${a11y.length} a11y issues`].filter(Boolean).join(", ") || "OK"}`);
  return closedBy;
}

async function discoverModals(page, view, reopen) {
  const seen = new Set();
  for (let pass = 0; pass < 40; pass++) {
    const cands = await page.evaluate(({ inc, exc }) => {
      const I = new RegExp(inc, "i"), E = new RegExp(exc, "i");
      // index over ALL matches (the same list Playwright's .nth() counts), then filter
      return [...document.querySelectorAll("button, [role=button], a[href='#']")]
        .map((b, i) => ({ b, i }))
        .filter(({ b }) => (b.offsetParent !== null || getComputedStyle(b).position === "fixed") && !b.disabled && !b.closest("nav,aside,[role=tablist]"))
        .map(({ b, i }) => ({ i, label: (b.innerText || b.getAttribute("aria-label") || b.title || "").trim().replace(/\s+/g, " ").slice(0, 50) }))
        .filter((c) => c.label && I.test(c.label) && !E.test(c.label));
    }, { inc: INCLUDE.source, exc: EXCLUDE.source });
    const next = cands.find((c) => !seen.has(c.label));
    if (!next) break;
    seen.add(next.label);
    const urlBefore = page.url();
    const btn = page.locator("button, [role=button], a[href='#']").nth(next.i);
    const before = await openDialogCount(page);
    await btn.click({ timeout: 3000 }).catch(() => {});
    await sleep(800);
    if ((await openDialogCount(page)) > before) {
      const closed = await modalChecks(page, `${view} › ${next.label}`, view);
      if (closed === "stuck") { await reopen(); }
    } else if (page.url() !== urlBefore) { await reopen(); }
  }
}

async function screen(page, view, url, opts = {}) {
  if (url) await page.goto(url);
  await settle(page);
  const shot = `${String(++shotNo).padStart(3, "0")}-${slug(view)}.jpg`;
  await page.screenshot({ path: `${OUT}/${shot}`, type: "jpeg", quality: 72, fullPage: true }).catch(() => {});
  const a11y = await axe(page);
  const tc = await typeAndColour(page);
  const [sw, w] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  report.screens.push({ view, shot, axe: a11y, ...tc, sideScroll: sw > w + 1 ? `${sw}px on ${w}px` : null });
  console.log(`▣ ${view}: ${a11y.length} a11y rule(s) failing, ${tc.fontSizes.length} font sizes${sw > w + 1 ? `, SIDE-SCROLL ${sw}/${w}` : ""}`);
  if (opts.modals) await discoverModals(page, view, async () => { await page.goto(url || page.url()); await settle(page); });
}

function watch(page, who) {
  page.on("dialog", async (d) => { report.xss.push(`${who}: a browser ${d.type()} box opened: "${d.message()}" at ${page.url()}`); await d.dismiss().catch(() => {}); });
  page.on("pageerror", (e) => report.errors.push(`${who} ${page.url()}: ${e.message}`));
}

(async () => {
  const browser = await chromium.launch();
  const desk = { viewport: { width: 1366, height: 860 }, timezoneId: "Africa/Nairobi", locale: "en-KE" };
  const phone = { ...devices["iPhone 13"], timezoneId: "Africa/Nairobi", locale: "en-KE" };
  const office = ["dashboard", "clients", "cash", "banks", "mpesa", "expenses", "exchange", "reconciliation", "invoices", "reports", "settings"];

  for (const [size, ctxOpts] of [["desktop", desk], ["phone", phone]]) {
    // ----- login page (signed out)
    {
      const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage(); watch(page, size);
      await screen(page, `${size} · Login`, `${WEB}/login`);
      await page.getByRole("tab", { name: "Phone number" }).click().catch(() => {});
      await screen(page, `${size} · Login – phone number`, null);
      await ctx.close();
    }
    // ----- Ugandan office: every tab and its pop-ups
    {
      const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage(); watch(page, `${size} office`);
      if (await signIn(page, S.ugOffice)) {
        for (const t of office) await screen(page, `${size} · Office ${t}`, `${WEB}/office/${t}`, { modals: true });
      } else report.errors.push(`${size}: office could not sign in`);
      await ctx.close();
    }
    // ----- super admin: every tab
    {
      const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage(); watch(page, `${size} admin`);
      if (await signIn(page, { code: "SA-2026-001", phone: "+254700000000", password: "Test@123" })) {
        await page.goto(`${WEB}/admin/dashboard`); await settle(page);
        for (const tab of ["Overview", "Bureaus", "Security", "Financial", "Analytics", "Audit log", "System"]) {
          const b = page.getByRole("button", { name: new RegExp(`^${tab}$`, "i") }).first();
          if (await b.count()) { await b.click().catch(() => {}); } else {
            const menu = page.getByRole("button", { name: /menu/i }).first(); if (await menu.count()) { await menu.click().catch(() => {}); await sleep(300); await page.getByText(tab, { exact: true }).first().click().catch(() => {}); }
          }
          await screen(page, `${size} · Admin ${tab}`, null, { modals: true });
        }
      } else report.errors.push(`${size}: super admin could not sign in`);
      await ctx.close();
    }
    // ----- client portal: every view
    {
      const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage(); watch(page, `${size} client`);
      if (await signIn(page, S.client)) {
        await page.goto(`${WEB}/client/dashboard`); await settle(page);
        for (const v of ["Dashboard", "Statements", "Alerts", "Analytics", "Profile"]) {
          let b = page.getByRole("button", { name: new RegExp(`^\\s*${v}`, "i") }).first();
          if (!(await b.count()) || !(await b.isVisible().catch(() => false))) {
            const menu = page.getByRole("button", { name: /menu|open navigation/i }).first();
            if (await menu.count()) { await menu.click().catch(() => {}); await sleep(300); }
            b = page.getByRole("button", { name: new RegExp(`^\\s*${v}`, "i") }).first();
          }
          await b.click().catch(() => {});
          await screen(page, `${size} · Client ${v}`, null, { modals: true });
        }
      } else report.errors.push(`${size}: client could not sign in`);
      await ctx.close();
    }
  }
  await browser.close();

  // ----- summary
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  const byRule = {};
  for (const s of [...report.screens, ...report.modals]) for (const v of s.axe || []) {
    byRule[v.id] ??= { impact: v.impact, help: v.help, screens: 0, nodes: 0, example: v.sample[0] };
    byRule[v.id].screens++; byRule[v.id].nodes += v.nodes;
  }
  console.log("\n================ DESIGN REVIEW SUMMARY ================");
  console.log(`screens: ${report.screens.length}, pop-ups found and opened: ${report.modals.length}`);
  console.log("\nAccessibility rules failing (WCAG 2.1 AA), worst first:");
  for (const [id, r] of Object.entries(byRule).sort((a, b) => ["critical", "serious", "moderate", "minor"].indexOf(a[1].impact) - ["critical", "serious", "moderate", "minor"].indexOf(b[1].impact) || b[1].nodes - a[1].nodes))
    console.log(`  [${r.impact}] ${id}: ${r.help} — ${r.screens} screen(s)/pop-up(s), ${r.nodes} element(s). e.g. ${r.example}`);
  const m = report.modals;
  console.log(`\nPop-ups: ${m.filter((x) => !x.hasRole).length}/${m.length} not announced as dialogs, ${m.filter((x) => !x.focusInside).length} don't move focus in, ${m.filter((x) => x.tabEscapes).length} let Tab escape, ${m.filter((x) => x.closedBy !== "escape").length} don't close on Escape`);
  const allSizes = new Set(report.screens.flatMap((s) => s.fontSizes.map((f) => f[0])));
  console.log(`\nFont sizes used across all screens: ${[...allSizes].sort((a, b) => parseFloat(a) - parseFloat(b)).join(", ")} (${allSizes.size} sizes)`);
  for (const s of report.screens.filter((x) => x.sideScroll)) console.log(`SIDE-SCROLL: ${s.view} (${s.sideScroll})`);
  for (const x of report.xss) console.log(`XSS: ${x}`);
  for (const e of report.errors.slice(0, 20)) console.log(`PAGE ERROR: ${e}`);
  console.log(`\nDESIGN: ${report.screens.length} screens, ${m.length} pop-ups, ${Object.keys(byRule).length} a11y rules failing, ${report.xss.length} script injections, ${report.errors.length} page errors`);
  process.exit(report.xss.length || report.errors.some((e) => /could not sign in/.test(e)) ? 1 : 0);
})().catch((e) => { console.log(`design review crashed: ${e.stack}`); process.exit(1); });
