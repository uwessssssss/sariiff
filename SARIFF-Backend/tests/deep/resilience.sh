#!/usr/bin/env bash
# SARIFF resilience: the database disappears while the API runs, then comes back.
# The API must say so quickly (no hanging requests, no crash) and recover by itself.
#   bash tests/deep/resilience.sh <api-url> <office-token>
# (a signed-in request is used: sign-in itself is rate-limited after the other tests)
set -u
API="$1"; TOKEN="${2:-}"; pass=0; fail=0
ok() { echo "PASS  $1"; pass=$((pass+1)); }; bad() { echo "FAIL  $1"; echo "        $2"; fail=$((fail+1)); }
PG=$(docker ps -q --filter "ancestor=postgres:16-alpine" | head -1)
[ -n "$PG" ] || { bad "postgres container found" "none"; echo "RESILIENCE: $pass passed, $((fail)) failed"; exit 1; }
code=$(curl -s -o /dev/null -w '%{http_code}' "$API/health/ready"); [ "$code" = 200 ] && ok "Ready check says ready while the database is up" || bad "Ready check says ready" "HTTP $code"
docker stop -t 2 "$PG" >/dev/null
sleep 2
t0=$(date +%s%N); code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$API/health/ready"); t1=$(date +%s%N); ms=$(( (t1-t0)/1000000 ))
[ "$code" = 503 ] && ok "Database down: ready check answers 503 (in ${ms} ms)" || bad "Database down: ready check answers 503" "HTTP $code in ${ms} ms"
code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$API/health"); [ "$code" = 200 ] && ok "Database down: the API process itself stays up" || bad "API process stays up" "HTTP $code"
t0=$(date +%s%N); code=$(curl -s -m 30 -o /tmp/res_body -w '%{http_code}' "$API/api/dashboard" -H "Authorization: Bearer $TOKEN"); t1=$(date +%s%N); ms=$(( (t1-t0)/1000000 ))
if [ "$code" = 503 ] && [ "$ms" -lt 20000 ] && ! grep -qiE 'stack|Npgsql|exception|at SARIFF' /tmp/res_body; then ok "Database down: a signed-in request answers 503 within 20 s with a clean message (${ms} ms)"; else bad "Database down: request answers 503 fast and clean" "HTTP $code in ${ms} ms: $(head -c 200 /tmp/res_body)"; fi
docker start "$PG" >/dev/null
for i in $(seq 1 60); do docker exec "$PG" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
rec=""; for i in $(seq 1 60); do c=$(curl -s -o /dev/null -w '%{http_code}' "$API/health/ready"); [ "$c" = 200 ] && { rec=$i; break; }; sleep 1; done
[ -n "$rec" ] && ok "Database back: the API recovers by itself (ready after ${rec} s, no restart)" || bad "API recovers without a restart" "not ready after 60 s"
echo; echo "RESILIENCE: $pass passed, $fail failed"; [ $fail = 0 ]
