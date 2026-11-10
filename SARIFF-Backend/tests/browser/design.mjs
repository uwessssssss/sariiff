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
const report = { screens: [], modals: [], xss: [], errors: [], clickProblems: [] };
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
// Toasts and charts are third-party and left out; so is text hidden from screen readers
// as decoration (aria-hidden).
async function typeAndColour(page) {
  return page.evaluate(() => {
    const sizes = {}, colours = {};
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      const t = n.textContent.trim();
      if (!t || !n.parentElement) continue;
      if (n.parentElement.closest("[data-sonner-toaster], .recharts-wrapper, [aria-hidden='true'], script, style, noscript")) continue;
      const cs = getComputedStyle(n.parentElement);
      if (cs.visibility === "hidden" || cs.display === "none" || n.parentElement.offsetParent === null && cs.position !== "fixed") continue;
      sizes[cs.fontSize] = (sizes[cs.fontSize] || 0) + t.length;
      colours[cs.color] = (colours[cs.color] || 0) + t.length;
    }
    const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
    return { fontSizes: top(sizes), textColours: top(colours).slice(0, 12) };
  });
}


// The type scale every screen must use (Tailwind steps; 60/72 only for the decorative
// sign-in hero, which is aria-hidden and so not counted above).
const SCALE = new Set(["12px", "14px", "16px", "18px", "20px", "24px", "30px", "36px", "48px"]);

// Layout: anything that runs past the screen edge. Inside a box that scrolls sideways is
// fine (wide tables); anything else either makes the whole page scroll sideways or is cut
// off by a parent with overflow hidden — text or controls the user cannot reach.
// Desktop also checks that the sidebar and the page content don't overlap.
async function layout(page) {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const out = { pageScrollsSideways: document.documentElement.scrollWidth > W + 1 ? document.documentElement.scrollWidth : 0, overflow: [], clipped: [], sidebar: null };
    const name = (el) => { const id = el.id ? `#${el.id}` : ""; const c = (el.getAttribute("class") || "").split(/\s+/).filter((x) => x && !x.includes(":")).slice(0, 4).join("."); return `${el.tagName.toLowerCase()}${id}${c ? "." + c : ""}`.slice(0, 90); };
    const meaningful = (el) => el.matches("button, a, input, select, textarea, [role=button], table") || (el.innerText || "").trim().length > 0;
    const flagged = new Set();
    for (const el of document.body.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.position === "fixed") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.right <= W + 1 && r.left >= -1) continue;
      if (el.closest('[aria-hidden="true"], [inert], [data-sonner-toaster]') || !meaningful(el)) continue;
      let a = el.parentElement, how = "overflow";
      for (; a && a !== document.body; a = a.parentElement) {
        const acs = getComputedStyle(a);
        if (acs.position === "fixed" && a.getBoundingClientRect().right > W + 1) { how = "offscreen"; break; } // a closed drawer
        if (/(auto|scroll)/.test(acs.overflowX)) { how = "scrolls"; break; }
        if (/(hidden|clip)/.test(acs.overflowX)) { how = a.getBoundingClientRect().right <= W + 1 ? "clipped" : "overflow"; if (how === "clipped") break; }
      }
      if (how === "scrolls" || how === "offscreen") continue;
      // report the outermost element only
      let p = el.parentElement, inner = false; for (; p; p = p.parentElement) if (flagged.has(p)) { inner = true; break; }
      flagged.add(el);
      if (inner) continue;
      (how === "clipped" ? out.clipped : out.overflow).push(`${name(el)} (${Math.round(r.left)}…${Math.round(r.right)}px of ${W}px)`);
    }
    out.overflow = out.overflow.slice(0, 8); out.clipped = out.clipped.slice(0, 8);
    const aside = [...document.querySelectorAll("aside, nav")].find((e) => { const c = getComputedStyle(e); const r = e.getBoundingClientRect(); return c.display !== "none" && r.width > 40 && r.height > 300 && r.left < 5; });
    if (aside && W >= 1024) {
      const ar = aside.getBoundingClientRect();
      const main = document.querySelector("main") || [...document.querySelectorAll("h1, h2")].find((h) => !aside.contains(h));
      const mr = main ? main.getBoundingClientRect() : null;
      out.sidebar = { width: Math.round(ar.width), contentLeft: mr ? Math.round(mr.left) : null, overlap: !!mr && mr.left < ar.right - 1 && mr.width > 0 };
    }
    return out;
  });
}

// Tap targets under 24×24 CSS px (WCAG 2.2 "target size minimum"), phone only.
async function targetSize(page) {
  return page.evaluate(() => [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, [role=button], [role=tab]")]
    .filter((e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return c.visibility !== "hidden" && c.display !== "none" && r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24) && !e.closest('[aria-hidden="true"], [inert]') && !(e.tagName === "A" && getComputedStyle(e).display === "inline"); })
    .slice(0, 10).map((e) => `${e.tagName.toLowerCase()} "${(e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 30)}" ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`));
}

// a closed drawer stays in the page as an aria-hidden fixed layer: never count it as open
const DIALOG = '[role="dialog"]:not([aria-hidden="true"] *):visible, [role="alertdialog"]:not([aria-hidden="true"] *):visible, div.fixed.inset-0:not([aria-hidden="true"]):visible';
const INCLUDE = /^(\+\s*)?(add|new|create|record|edit|view|open|details|statement|deposit|withdraw|transfer|buy|sell|exchange|expense|invoice|reconcile|set|fund|top up|convert|change|share|filter|more|manage|settle|opening|closing|alert|pin|history|move|link|start|count)\b/i;
const EXCLUDE = /delete|remove|log ?out|sign ?out|deactivate|suspend|reset|block|void|cancel|close|confirm|save|submit|pay|send|unlink|approve|reject|disable|archive|mark all|download|export|print|csv|pdf|refresh|activate/i;

async function openDialogCount(page) { return page.locator(DIALOG).count(); }

async function closeDialog(page, before = 0) {
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(350);
  if ((await openDialogCount(page)) <= before) return "escape";
  const btn = page.locator(DIALOG).last().locator('button:has-text("Cancel"), button:has-text("Close"), button[aria-label*="lose" i], button:has-text("×"), button:has-text("✕")').first();
  if (await btn.count()) { await btn.click({ timeout: 2000 }).catch(() => {}); await sleep(350); if ((await openDialogCount(page)) <= before) return "button"; }
  return "stuck";
}

async function modalChecks(page, name, view, before = 0) {
  const shot = `${String(++shotNo).padStart(3, "0")}-modal-${slug(name)}.jpg`;
  await sleep(400);
  await page.screenshot({ path: `${OUT}/${shot}`, type: "jpeg", quality: 72 }).catch(() => {});
  const info = await page.evaluate((sel) => {
    // only layers actually on screen (a closed drawer is aria-hidden / invisible)
    const shown = (e) => { const c = getComputedStyle(e); return e.getClientRects().length > 0 && c.visibility !== "hidden" && c.display !== "none" && parseFloat(c.opacity || "1") > 0.05 && !e.closest('[aria-hidden="true"]'); };
    const els = [...document.querySelectorAll(sel.replace(/:visible/g, ""))].filter(shown);
    const d = els.at(-1);
    if (!d) return null;
    if (!d.id) d.id = `sarif-audit-dialog-${Math.random().toString(36).slice(2, 7)}`;
    const roleEl = d.matches('[role="dialog"],[role="alertdialog"]') ? d : d.querySelector('[role="dialog"],[role="alertdialog"]');
    const panel = roleEl || [...d.children].find((k) => k.querySelector("button, input, select, textarea")) || d;
    const r = panel.getBoundingClientRect();
    // can the user reach all of it? (it fits, or something around it scrolls)
    let scrolls = false;
    for (let a = panel; a && a !== document.body; a = a.parentElement) { const c = getComputedStyle(a); if (/(auto|scroll)/.test(c.overflowY) && a.scrollHeight > a.clientHeight + 1) { scrolls = true; break; } }
    const title = (panel.querySelector("h1,h2,h3")?.textContent || "").trim().slice(0, 80);
    return { id: d.id, hasRole: !!roleEl, ariaModal: roleEl?.getAttribute("aria-modal") === "true", labelled: !!(roleEl && (roleEl.getAttribute("aria-labelledby") || roleEl.getAttribute("aria-label"))), title,
      focusInside: d.contains(document.activeElement) && document.activeElement !== document.body,
      tooTall: (r.top < -2 || r.bottom > window.innerHeight + 2) && !scrolls,
      tooWide: r.left < -2 || r.right > document.documentElement.clientWidth + 2 };
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
  const closedBy = await closeDialog(page, before);
  report.modals.push({ view, name, shot, ...info, tabEscapes: escaped, closedBy, axe: a11y });
  console.log(`  ◻ ${name}${info.title ? ` — "${info.title}"` : ""}: ${[info.tooTall && "taller than the screen", info.tooWide && "wider than the screen", !info.hasRole && "no dialog role", info.hasRole && !info.labelled && "no label", !info.focusInside && "focus not moved in", escaped && "Tab leaves it", closedBy !== "escape" && `Escape doesn't close (${closedBy})`, a11y.length && `${a11y.length} a11y issues`].filter(Boolean).join(", ") || "OK"}`);
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
    let clickErr = null;
    await btn.click({ timeout: 3000 }).catch((e) => { const lines = String(e.message).split("\n"); clickErr = (lines.find((l) => /intercepts pointer events/.test(l)) || lines.find((l) => /not visible|outside of the viewport|not stable|detached/.test(l)) || lines[0]).trim().slice(0, 200); });
    if (clickErr) {
      // record why a person's tap would fail too, then force it so the review goes on
      report.clickProblems.push(`${view} › ${next.label}: ${clickErr}`);
      console.log(`  ✗ couldn't press "${next.label}": ${clickErr}`);
      await btn.click({ timeout: 2000, force: true }).catch(() => {});
    }
    await sleep(800);
    if ((await openDialogCount(page)) > before) {
      const closed = await modalChecks(page, `${view} › ${next.label}`, view, before);
      if (closed === "stuck") { await reopen(); }
    } else if (page.url() !== urlBefore) { await reopen(); }
  }
}

async function screen(page, view, url, opts = {}) {
  if (url) await page.goto(url);
  await settle(page);
  const shot = `${String(++shotNo).padStart(3, "0")}-${slug(view)}.jpg`;
  const isPhone = view.startsWith("phone");
  // desktop: the window as the user sees it (a full-page capture of a fixed-sidebar layout
  // stretches and blanks it); phone: the whole scrolling page
  await page.screenshot({ path: `${OUT}/${shot}`, type: "jpeg", quality: 72, fullPage: isPhone }).catch(() => {});
  const a11y = await axe(page);
  const tc = await typeAndColour(page);
  const lay = await layout(page);
  const offScale = tc.fontSizes.map((f) => f[0]).filter((f) => !SCALE.has(f));
  const tiny = isPhone ? await targetSize(page) : [];
  report.screens.push({ view, shot, axe: a11y, ...tc, offScale, layout: lay, smallTargets: tiny, sideScroll: lay.pageScrollsSideways ? `${lay.pageScrollsSideways}px on the screen` : null });
  const notes = [
    `${a11y.length} a11y rule(s) failing`,
    offScale.length && `off-scale font sizes ${offScale.join(", ")}`,
    lay.pageScrollsSideways && `PAGE SCROLLS SIDEWAYS (${lay.pageScrollsSideways}px)`,
    lay.overflow.length && `${lay.overflow.length} element(s) past the screen edge`,
    lay.clipped.length && `${lay.clipped.length} element(s) cut off`,
    lay.sidebar?.overlap && "content under the sidebar",
    tiny.length && `${tiny.length} tap target(s) under 24px`,
  ].filter(Boolean).join(", ");
  console.log(`▣ ${view}: ${notes}`);
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
  for (const s of report.screens.filter((x) => x.offScale.length)) console.log(`OFF-SCALE TYPE: ${s.view}: ${s.offScale.join(", ")}`);
  for (const s of report.screens) {
    const L = s.layout; if (!L) continue;
    if (L.pageScrollsSideways) console.log(`SIDE-SCROLL: ${s.view}: the page is ${L.pageScrollsSideways}px wide`);
    for (const o of L.overflow) console.log(`PAST THE EDGE: ${s.view}: ${o}`);
    for (const o of L.clipped) console.log(`CUT OFF: ${s.view}: ${o}`);
    if (L.sidebar) console.log(`SIDEBAR: ${s.view}: ${L.sidebar.width}px wide, content starts at ${L.sidebar.contentLeft}px${L.sidebar.overlap ? " — OVERLAPS" : ""}`);
  }
  const small = report.screens.filter((s) => s.smallTargets?.length);
  console.log(`\nTap targets under 24px on phone (WCAG 2.2, reported): ${small.reduce((n, s) => n + s.smallTargets.length, 0)} on ${small.length} screen(s)`);
  for (const s of small) console.log(`  ${s.view}: ${s.smallTargets.slice(0, 4).join("; ")}`);
  for (const c of report.clickProblems.slice(0, 20)) console.log(`BLOCKED TAP: ${c}`);
  for (const x of report.xss) console.log(`XSS: ${x}`);
  for (const e of report.errors.slice(0, 20)) console.log(`PAGE ERROR: ${e}`);

  // ----- the gate: what must be true for the design to pass
  const serious = Object.entries(byRule).filter(([, r]) => ["critical", "serious"].includes(r.impact));
  const gate = [
    [`no serious/critical WCAG 2.1 AA failures (${serious.map(([id]) => id).join(", ") || "none"})`, serious.length === 0],
    [`every pop-up is announced as a dialog (${m.filter((x) => !x.hasRole).length} not)`, m.every((x) => x.hasRole)],
    [`every pop-up takes focus (${m.filter((x) => !x.focusInside).length} don't)`, m.every((x) => x.focusInside)],
    [`Tab stays inside every pop-up (${m.filter((x) => x.tabEscapes).length} leak)`, m.every((x) => !x.tabEscapes)],
    [`Escape closes every pop-up (${m.filter((x) => x.closedBy !== "escape").length} don't)`, m.every((x) => x.closedBy === "escape")],
    [`no pop-up taller than the screen without scrolling (${m.filter((x) => x.tooTall).length})`, m.every((x) => !x.tooTall)],
    [`no pop-up wider than the screen (${m.filter((x) => x.tooWide).length})`, m.every((x) => !x.tooWide)],
    [`pop-ups found on phone as well as desktop (${m.filter((x) => x.view.startsWith("phone")).length} on phone)`, m.some((x) => x.view.startsWith("phone"))],
    [`every button can be pressed — nothing covers it (${report.clickProblems.length} blocked)`, report.clickProblems.length === 0],
    [`one type scale (${report.screens.filter((x) => x.offScale.length).length} screen(s) off it)`, report.screens.every((x) => !x.offScale.length)],
    [`nothing scrolls the page sideways or runs off the screen (${report.screens.filter((x) => x.layout?.pageScrollsSideways || x.layout?.overflow.length).length} screen(s))`, report.screens.every((x) => !x.layout?.pageScrollsSideways && !x.layout?.overflow.length)],
    [`no text or control cut off (${report.screens.filter((x) => x.layout?.clipped.length).length} screen(s))`, report.screens.every((x) => !x.layout?.clipped.length)],
    [`sidebar never covers the content`, report.screens.every((x) => !x.layout?.sidebar?.overlap)],
    [`every screen was reached (${report.errors.filter((e) => /could not sign in/.test(e)).length} sign-in failures)`, !report.errors.some((e) => /could not sign in/.test(e))],
    [`no script injection (${report.xss.length})`, report.xss.length === 0],
    [`no page errors (${report.errors.length})`, report.errors.length === 0],
  ];
  console.log("\n---------------- DESIGN GATE ----------------");
  for (const [label, ok] of gate) console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  const failed = gate.filter(([, ok]) => !ok).length;
  console.log(`\nDESIGN: ${report.screens.length} screens, ${m.length} pop-ups, ${Object.keys(byRule).length} a11y rules failing, ${gate.length - failed}/${gate.length} gate checks pass`);
  report.gate = gate.map(([label, ok]) => ({ label, ok }));
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`design review crashed: ${e.stack}`); process.exit(1); });
