// Prints an office access token (for scanners that need to sign in).
//   node tests/deep/token.mjs <api-url> <api-log> <e2e-state.json>
import { readFileSync } from "node:fs";
import { client } from "../lib/sarif.mjs";
const [BASE, LOG, STATE] = process.argv.slice(2);
const S = JSON.parse(readFileSync(STATE, "utf8"));
const t = await client(BASE, LOG).login(S.ugOffice);
if (!t) { console.error("could not sign in"); process.exit(1); }
process.stdout.write(t);
