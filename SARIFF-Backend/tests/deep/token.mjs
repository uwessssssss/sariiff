// Prints an access token for scanners that need to sign in.
//   node tests/deep/token.mjs <api-url> <api-log> <e2e-state.json> [office|client|admin]
import { readFileSync } from "node:fs";
import { client } from "../lib/sarif.mjs";
const [BASE, LOG, STATE, ROLE = "office"] = process.argv.slice(2);
const S = JSON.parse(readFileSync(STATE, "utf8"));
const who = ROLE === "client" ? S.client : ROLE === "admin" ? { code: "SA-2026-001", phone: "+254700000000", password: "Test@123" } : S.ugOffice;
const t = await client(BASE, LOG).login(who);
if (!t) { console.error(`could not sign in as ${ROLE}`); process.exit(1); }
process.stdout.write(t);
