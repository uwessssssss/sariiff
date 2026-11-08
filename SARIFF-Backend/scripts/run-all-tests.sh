#!/usr/bin/env bash
# =============================================================================
#  SARIFF — run EVERY test, backend + web + mobile, and write one report.
#
#    cd ~/Projects/SARIFF-Backend && bash scripts/run-all-tests.sh
#
#  Optional:  WEB_DIR=~/Projects/web  MOBILE_DIR=~/Projects/sariff-mobile  bash scripts/run-all-tests.sh
#             SKIP_DOCKER_IMAGE=1   (skip the slow production image build)
#
#  SAFE FOR YOUR DATA: it never touches your running stack or its database.
#  It starts its OWN throwaway Postgres (port 55432) and its OWN API (port 18080),
#  then removes both at the end — even if a step fails or you press Ctrl+C.
# =============================================================================
set -uo pipefail

BACKEND="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$HOME/sariff-test-run-$STAMP"
mkdir -p "$OUT"
REPORT="$OUT/REPORT.txt"
PG_NAME="sariff-alltests-pg-$STAMP"
PG_PORT=55432
API_PORT=18080
API_PID=""

# ---------- find the web and mobile projects
find_app() { # $1 = package name to look for in package.json dependencies
  for d in "$HOME"/Projects/* "$(dirname "$BACKEND")"/*; do
    [ -f "$d/package.json" ] && grep -q "\"$1\"" "$d/package.json" && { echo "$d"; return; }
  done
}
WEB_DIR="${WEB_DIR:-$(find_app next)}"
MOBILE_DIR="${MOBILE_DIR:-$(find_app expo)}"

declare -a NAMES STATUS SECS
step() { # step "name" command...
  local name="$1"; shift
  local log="$OUT/$(echo "$name" | tr ' /:' '___').log"
  local t0=$SECONDS
  printf "\n▶ %s\n" "$name"
  if "$@" >"$log" 2>&1; then STATUS+=("PASS"); printf "  PASS  (%ss)\n" $((SECONDS - t0))
  else STATUS+=("FAIL"); printf "  FAIL  (%ss) — last lines:\n" $((SECONDS - t0)); tail -25 "$log" | sed 's/^/    /'; fi
  NAMES+=("$name"); SECS+=($((SECONDS - t0)))
}
skip() { NAMES+=("$1"); STATUS+=("SKIP"); SECS+=(0); printf "\n▶ %s\n  SKIP  %s\n" "$1" "$2"; }

cleanup() {
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null
  docker rm -f "$PG_NAME" >/dev/null 2>&1
}
trap cleanup EXIT INT TERM

echo "SARIFF — full test run ($STAMP)"
echo "  backend: $BACKEND"
echo "  web:     ${WEB_DIR:-NOT FOUND}"
echo "  mobile:  ${MOBILE_DIR:-NOT FOUND}"
echo "  logs:    $OUT"

# ---------- tools
for t in dotnet docker node npm; do command -v $t >/dev/null || { echo "Missing tool: $t"; exit 2; }; done

# ===================== BACKEND =====================
cd "$BACKEND"
step "Backend: build (Release)" dotnet build SARIFF.sln -c Release

if dotnet ef --version >/dev/null 2>&1; then
  step "Backend: database migrations match the code" \
    dotnet ef migrations has-pending-model-changes -p src/SARIFF.Infrastructure -s src/SARIFF.API
  latest="$(ls -t src/SARIFF.Infrastructure/Migrations/*_*.cs 2>/dev/null | grep -v Designer | head -1)"
  if [ -n "$latest" ]; then
    step "Backend: newest migration only adds (no drops in Up)" \
      bash -c "! awk '/void Up\\(/,/void Down\\(/' '$latest' | grep -nE 'DropTable|DropColumn|name: \"xmin\"'"
  fi
else
  skip "Backend: database migrations match the code" "dotnet-ef not installed (dotnet tool install -g dotnet-ef)"
fi

step "Throwaway Postgres: start (port $PG_PORT)" bash -c "
  docker run -d --rm --name '$PG_NAME' -e POSTGRES_PASSWORD=postgres -p $PG_PORT:5432 postgres:16-alpine >/dev/null &&
  for i in \$(seq 1 60); do docker exec '$PG_NAME' pg_isready -U postgres >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1"

PG_CS="Host=127.0.0.1;Port=$PG_PORT;Username=postgres;Password=postgres"
step "Backend: ALL unit + Postgres tests (none skipped)" \
  env SARIFF_TEST_PG="$PG_CS;Database=postgres" dotnet test SARIFF.sln -c Release --no-build --logger "console;verbosity=normal"

# ---------- live API on a fresh database, then the end-to-end scenario
API_LOG="$OUT/api-under-test.log"
start_api() {
  ASPNETCORE_ENVIRONMENT=Development ASPNETCORE_URLS="http://127.0.0.1:$API_PORT" \
  ConnectionStrings__DefaultConnection="$PG_CS;Database=sariff_e2e" \
    dotnet run --project src/SARIFF.API -c Release --no-build --no-launch-profile >"$API_LOG" 2>&1 &
  API_PID=$!
  for i in $(seq 1 120); do curl -sf "http://127.0.0.1:$API_PORT/health" >/dev/null && return 0; sleep 1; done
  echo "API did not answer /health in 120 s"; tail -40 "$API_LOG"; return 1
}
step "Live API: start on a fresh database (port $API_PORT)" start_api
step "End-to-end: two bureaus, wallets, money, times, portal, phone login" \
  node tests/e2e/e2e.mjs "http://127.0.0.1:$API_PORT" "$API_LOG"
[ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null; API_PID=""

if [ "${SKIP_DOCKER_IMAGE:-0}" = "1" ]; then skip "Backend: production Docker image builds" "SKIP_DOCKER_IMAGE=1"
else step "Backend: production Docker image builds" docker build -f docker/Dockerfile -t sariff-api:alltests . ; fi

# ===================== WEB =====================
if [ -n "$WEB_DIR" ]; then
  cd "$WEB_DIR"
  step "Web: install exact dependencies (npm ci)" npm ci --no-audit --no-fund
  step "Web: type check (every file)" npx tsc --noEmit
  step "Web: production build (next build)" npm run build
else skip "Web" "web project not found — set WEB_DIR"; fi

# ===================== MOBILE =====================
if [ -n "$MOBILE_DIR" ]; then
  cd "$MOBILE_DIR"
  # package.json lists packages the lock file doesn't (expo-print, expo-local-authentication).
  # npm ci — and EAS Build — refuse that, so bring the lock file in line first.
  lock_in_sync() { node -e '
    const pj = require("./package.json"), lk = require("./package-lock.json").packages[""] || {};
    const want = { ...pj.dependencies, ...pj.devDependencies }, have = { ...lk.dependencies, ...lk.devDependencies };
    const off = Object.keys(want).filter((k) => have[k] !== want[k]);
    if (off.length) { console.log("lock file missing/out of date for: " + off.join(", ")); process.exit(1); }'; }
  if ! lock_in_sync >/dev/null 2>&1; then
    step "Mobile: update package-lock.json to match package.json (commit it!)" bash -c "npx expo install expo-print expo-local-authentication && npm install --no-audit --no-fund"
  fi
  step "Mobile: lock file matches package.json (EAS Build needs this)" lock_in_sync
  step "Mobile: install exact dependencies (npm ci)" npm ci --no-audit --no-fund
  step "Mobile: type check (every file)" npx tsc --noEmit
  step "Mobile: Expo project health (expo-doctor)" npx expo-doctor
else skip "Mobile" "mobile project not found — set MOBILE_DIR"; fi

# ===================== SHARED APP LOGIC =====================
if [ -n "$WEB_DIR" ] && [ -n "$MOBILE_DIR" ]; then
  step "Web + mobile logic: 90 tests at 01:30 Nairobi time" bash "$BACKEND/tests/app-logic/run.sh" "$WEB_DIR" "$MOBILE_DIR"
fi

# ===================== REPORT =====================
p=0; f=0; s=0
for st in "${STATUS[@]}"; do case "$st" in PASS) p=$((p+1));; FAIL) f=$((f+1));; SKIP) s=$((s+1));; esac; done
{
  echo "SARIFF full test run — $STAMP"
  echo "================================================================"
  for i in "${!NAMES[@]}"; do
    printf "%-5s %-62s %4ss\n" "${STATUS[$i]}" "${NAMES[$i]}" "${SECS[$i]}"
  done
  echo "================================================================"
  echo "STEPS: $p passed, $f failed, $s skipped"
  echo
  echo "Test counts:"
  grep -hE "^(Passed!|Failed!)|Total tests|Passed:|Failed:" "$OUT"/Backend__ALL_unit*.log 2>/dev/null | head -4 | sed 's/^/  backend  /'
  grep -h "END-TO-END:" "$OUT"/End-to-end*.log 2>/dev/null | sed 's/^/  /'
  grep -h "passed, .* failed" "$OUT"/Web_+_mobile_logic*.log 2>/dev/null | sed 's/^/  app logic  /'
  echo
  [ "$f" -gt 0 ] && { echo "FAILED STEPS (send these logs):"; for i in "${!NAMES[@]}"; do [ "${STATUS[$i]}" = FAIL ] && echo "  $OUT/$(echo "${NAMES[$i]}" | tr ' /:' '___').log"; done; }
} | tee "$REPORT"
echo
echo "Full report: $REPORT"
[ "$f" -eq 0 ]
