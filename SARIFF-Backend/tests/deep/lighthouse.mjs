// Reads Lighthouse JSON reports and prints the four scores. Fails if accessibility or
// best practices drop below 90 on any page.   node lighthouse.mjs <report.json>...
import { readFileSync } from "node:fs";
let bad = 0;
for (const f of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(f, "utf8"));
  const s = Object.fromEntries(Object.entries(r.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
  console.log(`${r.finalDisplayedUrl}: performance ${s.performance}, accessibility ${s.accessibility}, best practices ${s["best-practices"]}, SEO ${s.seo}`);
  for (const [k, a] of Object.entries(r.audits)) if (a.score !== null && a.score < 0.9 && a.scoreDisplayMode === "binary") console.log(`   - ${k}: ${a.title}`);
  if (s.performance < 90) {
    // Where the time goes, and what Lighthouse says would save the most.
    const m = (id) => r.audits[id]?.displayValue ?? "?";
    console.log(`   timings: FCP ${m("first-contentful-paint")}, LCP ${m("largest-contentful-paint")}, TBT ${m("total-blocking-time")}, CLS ${m("cumulative-layout-shift")}, SI ${m("speed-index")}`);
    const lcpEl = r.audits["largest-contentful-paint-element"]?.details?.items?.[0]?.items?.[0]?.node?.snippet;
    if (lcpEl) console.log(`   LCP element: ${lcpEl.slice(0, 160)}`);
    Object.values(r.audits)
      .filter((a) => a.details?.type === "opportunity" && (a.details.overallSavingsMs || 0) > 50)
      .sort((x, y) => y.details.overallSavingsMs - x.details.overallSavingsMs)
      .slice(0, 5)
      .forEach((a) => console.log(`   save ~${Math.round(a.details.overallSavingsMs)} ms: ${a.title}${a.displayValue ? ` (${a.displayValue})` : ""}`));
    for (const id of ["bootup-time", "mainthread-work-breakdown", "render-blocking-resources", "unused-javascript"])
      if (r.audits[id]?.displayValue) console.log(`   ${r.audits[id].title}: ${r.audits[id].displayValue}`);
  }
  if (s.accessibility < 90 || s["best-practices"] < 90) bad++;
}
console.log(bad ? `\nLIGHTHOUSE: ${bad} page(s) under 90` : "\nLIGHTHOUSE: all pages at 90+ for accessibility and best practices");
process.exit(bad ? 1 : 0);
