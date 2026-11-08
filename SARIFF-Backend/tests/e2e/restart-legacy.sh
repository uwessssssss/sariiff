#!/usr/bin/env bash
# Old data + restart test. Run AFTER tests/e2e/e2e.mjs, against the same database.
#   bash tests/e2e/restart-legacy.sh <psql-url> <api-port> <api-log>
#
# 1. Makes wallets look like they did before wallet currencies existed (Currency = NULL),
#    in the four situations a real database can hold.
# 2. Restarts the API twice (start-up runs the migration + MobileMoney.BackfillAsync).
# 3. Checks: the right currency was filled in, the risky one was left alone,
#    and not one balance or transaction changed anywhere.
set -uo pipefail
DB="$1"; PORT="$2"; LOG="$3"
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
q() { psql "$DB" -XAtqc "$1"; }
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "        expected [$3], got [$2]"; fi; }

money() { q 'SELECT string_agg(x, '';'' ORDER BY x) FROM (
  SELECT ''m''||"Id"||''=''||"Balance"||''/''||"OpeningBalance" x FROM "MpesaAgents" WHERE "Code" NOT LIKE ''LEG-%''
  UNION ALL SELECT ''c''||"Id"||''=''||"Balance" FROM "CashAccounts"
  UNION ALL SELECT ''b''||"Id"||''=''||"Balance" FROM "BankAccounts"
  UNION ALL SELECT ''cb''||"Id"||''=''||"Balance" FROM "ClientCurrencyBalances"
  UNION ALL SELECT ''u''||"Id"||''=''||"BalanceKES"||''/''||"BalanceUSD" FROM "Users"
  UNION ALL SELECT ''t''||"Id"||''=''||"Amount" FROM "Transactions") s' | md5sum | cut -c1-12; }

restart() {
  pkill -f "SARIFF.API" ; for i in $(seq 1 30); do pgrep -f "SARIFF.API" >/dev/null || break; sleep 1; done
  : >"$LOG.restart"
  ( cd "$HERE/src/SARIFF.API" && PORT="$PORT" ASPNETCORE_ENVIRONMENT=Development \
      ConnectionStrings__DefaultConnection="$API_CS" nohup dotnet bin/Release/net8.0/SARIFF.API.dll >>"$LOG.restart" 2>&1 & )
  for i in $(seq 1 120); do curl -sf "http://127.0.0.1:$PORT/health" >/dev/null && return 0; sleep 1; done
  echo "API did not come back"; tail -40 "$LOG.restart"; return 1
}

UG=$(q "SELECT \"CompanyId\" FROM \"MpesaAgents\" WHERE \"AgentNumber\"='E2E-MP-1'")
KE=$(q "SELECT \"Id\" FROM \"Companies\" WHERE \"BaseCurrency\"=0 ORDER BY \"CreatedAt\" LIMIT 1")
[ -n "$UG" ] && [ -n "$KE" ] || { echo "FAIL  e2e data not found (run e2e.mjs first)"; exit 1; }

ins() { # code company provider balance
  q "INSERT INTO \"MpesaAgents\" (\"Id\",\"Code\",\"CompanyId\",\"AgentName\",\"PhoneNumber\",\"AgentNumber\",\"StoreNumber\",\"AgentType\",\"Provider\",\"Currency\",\"Balance\",\"OpeningBalance\",\"IsActive\",\"CreatedAt\",\"UpdatedAt\",\"IsDeleted\")
     VALUES (gen_random_uuid(),'$1','$2','Legacy $1','+254700999000','$1',NULL,0,$3,NULL,$4,$4,true,now(),now(),false)"; }
# A: Ugandan bureau, M-Pesa, already holds money (it was UGX all along) -> must stay NULL (= UGX)
q "UPDATE \"MpesaAgents\" SET \"Currency\"=NULL WHERE \"AgentNumber\"='E2E-MP-1'"
# B: Ugandan bureau, M-Pesa, empty and unused -> KES
ins LEG-B "$UG" 0 0
# C: Ugandan bureau, MTN -> UGX
q "UPDATE \"MpesaAgents\" SET \"Currency\"=NULL WHERE \"AgentNumber\"='E2E-MTN-1'"
# D: Kenyan bureau, M-Pesa with money -> KES
ins LEG-D "$KE" 0 7500
# E: Ugandan bureau, Airtel -> UGX (home)
ins LEG-E "$UG" 2 1200

before=$(money)
txns=$(q 'SELECT count(*) FROM "Transactions"')
echo "money fingerprint before: $before ($txns transactions)"

API_CS="${API_CS:?set API_CS to the API connection string}"
restart || { echo "FAIL  API restart"; exit 1; }
cur() { q "SELECT coalesce(\"Currency\"::text,'NULL') FROM \"MpesaAgents\" WHERE \"AgentNumber\"='$1'"; }
check "A: old Ugandan M-Pesa wallet that holds money is NOT relabelled (stays home UGX)" "$(cur E2E-MP-1)" "NULL"
check "A: …and its 50,000 balance is untouched" "$(q "SELECT \"Balance\"::numeric(18,2) FROM \"MpesaAgents\" WHERE \"AgentNumber\"='E2E-MP-1'")" "50000.00"
check "A: …and a warning is logged for review" "$(grep -c 'left for review\|Left as' "$LOG.restart" | awk '{print ($1>0)?"yes":"no"}')" "yes"
check "B: empty old Ugandan M-Pesa wallet becomes KES" "$(cur LEG-B)" "0"
check "C: old MTN wallet becomes UGX" "$(cur E2E-MTN-1)" "2"
check "D: old Kenyan M-Pesa wallet becomes KES" "$(cur LEG-D)" "0"
check "D: …balance 7,500 untouched" "$(q "SELECT \"Balance\"::numeric(18,2) FROM \"MpesaAgents\" WHERE \"AgentNumber\"='LEG-D'")" "7500.00"
check "E: old Airtel wallet in a Ugandan bureau becomes UGX" "$(cur LEG-E)" "2"
check "No balance or transaction amount changed anywhere" "$(money)" "$before"
check "No transaction added or lost" "$(q 'SELECT count(*) FROM "Transactions"')" "$txns"
grep -qiE "unhandled|fatal|exception" "$LOG.restart" && { echo "        log has errors:"; grep -iE "unhandled|fatal|exception" "$LOG.restart" | head -5; }
check "Start-up log has no exceptions" "$(grep -ciE 'unhandled|fatal|exception' "$LOG.restart")" "0"

restart || { echo "FAIL  second API restart"; exit 1; }
check "Second restart changes nothing (safe to run on every deploy)" "$(money)" "$before"
check "A is still NULL after the second restart" "$(cur E2E-MP-1)" "NULL"
cat "$LOG.restart" >>"$LOG"

echo; echo "RESTART + OLD DATA: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
