#!/usr/bin/env bash
# Runs the web + mobile logic tests against the REAL app source, at 01:30 Nairobi time.
#   tests/app-logic/run.sh <web-dir> <mobile-dir>
set -euo pipefail
WEB="$1"; MOB="$2"; HERE="$(cd "$(dirname "$0")" && pwd)"
TSC="$WEB/node_modules/.bin/tsc"
[ -x "$TSC" ] || { echo "FAIL  web node_modules missing (run npm ci in $WEB first)"; exit 1; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/src/web" "$T/src/mob/types" "$T/src/mob/utils"
cp "$WEB"/lib/{dates,moneyflow,useBaseCurrency,whatsapp,print}.ts "$T/src/web/"
cp -r "$WEB/lib/api" "$T/src/web/api"   # the API client is a folder (one file per area + index)
cp "$MOB/src/types/index.ts" "$T/src/mob/types/index.ts"
cp "$MOB"/src/utils/{dates,moneyflow}.ts "$T/src/mob/utils/"
cat > "$T/tsconfig.json" <<'J'
{ "compilerOptions": { "target": "es2020", "module": "commonjs", "outDir": "out", "rootDir": "src", "strict": false,
  "skipLibCheck": true, "noEmitOnError": false, "lib": ["es2020", "dom"], "types": [] }, "include": ["src/**/*.ts"] }
J
( cd "$T" && "$TSC" -p tsconfig.json >/dev/null 2>&1 || true )   # type errors don't matter here, only the emitted JS
mkdir -p "$T/out/node_modules/@/lib" "$T/out/node_modules/react"
echo 'module.exports = require("../../../web/api");' > "$T/out/node_modules/@/lib/api.js"
echo 'module.exports = { useState: v => [typeof v === "function" ? v() : v, () => {}], useEffect() {}, useMemo: f => f(), useCallback: f => f };' > "$T/out/node_modules/react/index.js"
cp "$HERE/logic.test.js" "$HERE/dashboard.test.js" "$T/out/"
cd "$T/out"
rc=0
echo "-- app logic (money flow, currencies, wallets, formatting, totals, dates, printing)"; TZ=Africa/Nairobi node logic.test.js || rc=1
echo "-- dashboard holdings + clock"; TZ=Africa/Nairobi node dashboard.test.js || rc=1
exit $rc
