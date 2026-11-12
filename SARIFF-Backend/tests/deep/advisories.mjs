// Known security advisories in the shipped (production) dependencies of the web and mobile apps.
// Usage: node advisories.mjs <app dir>...   (run from the repo root, after npm ci)
// Prints every advisory; exits 1 on a high or critical one that is not in advisories-reviewed.json.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const reviewed = JSON.parse(readFileSync(join(here, "advisories-reviewed.json"), "utf8"));
let blocking = 0;

for (const dir of process.argv.slice(2)) {
  let out;
  try {
    out = execFileSync("npm", ["audit", "--omit=dev", "--json"], { cwd: dir, encoding: "utf8", maxBuffer: 64 << 20 });
  } catch (e) {
    out = e.stdout; // npm audit exits non-zero whenever it finds anything
  }
  const report = JSON.parse(out || "{}");
  console.log(`== ${dir}: ${JSON.stringify(report.metadata?.vulnerabilities || {})}`);
  for (const [name, v] of Object.entries(report.vulnerabilities || {})) {
    const titles = (v.via || []).map((x) => (typeof x === "string" ? `via ${x}` : x.title)).join("; ");
    // A package listed only because a dependency of it is affected ("via" names, no advisory of its
    // own) is counted once, at the package that carries the advisory.
    const ownAdvisories = (v.via || []).filter((x) => typeof x !== "string");
    const own = ownAdvisories.length > 0;
    const serious = ownAdvisories.some((x) => x.severity === "high" || x.severity === "critical");
    const why = reviewed[`${dir}:${name}`] || reviewed[name];
    const tag = !own ? " (inherited)" : !serious ? "" : why ? " (reviewed)" : " (BLOCKING)";
    console.log(`  [${v.severity}] ${name}${tag} — ${titles.slice(0, 200)}`);
    if (serious && why) console.log(`      reviewed: ${why}`);
    if (serious && !why) blocking++;
  }
}
console.log(`\nADVISORIES: blocking (high/critical, not reviewed) ${blocking}`);
process.exit(blocking ? 1 : 0);
