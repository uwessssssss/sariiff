// Reads Lighthouse JSON reports and prints the four scores. Fails if accessibility or
// best practices drop below 90 on any page.   node lighthouse.mjs <report.json>...
import { readFileSync } from "node:fs";
let bad = 0;
for (const f of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(f, "utf8"));
  const s = Object.fromEntries(Object.entries(r.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
  console.log(`${r.finalDisplayedUrl}: performance ${s.performance}, accessibility ${s.accessibility}, best practices ${s["best-practices"]}, SEO ${s.seo}`);
  for (const [k, a] of Object.entries(r.audits)) if (a.score !== null && a.score < 0.9 && a.scoreDisplayMode === "binary") console.log(`   - ${k}: ${a.title}`);
  if (s.accessibility < 90 || s["best-practices"] < 90) bad++;
}
console.log(bad ? `\nLIGHTHOUSE: ${bad} page(s) under 90` : "\nLIGHTHOUSE: all pages at 90+ for accessibility and best practices");
process.exit(bad ? 1 : 0);
