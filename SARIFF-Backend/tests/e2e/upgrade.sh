#!/usr/bin/env bash
# Upgrade test — what a Render deploy does to a database that already holds data.
#   bash tests/e2e/upgrade.sh <psql-url> <npgsql-connection-string> <api-port> <log>
#
# 1. Builds the schema exactly as it was BEFORE this release (up to ClientIdentities).
# 2. Puts data in it the old way: a Ugandan bureau, three wallets with no currency
#    column at all (it doesn't exist yet), a cash till, transactions.
# 3. Starts the NEW API on it — start-up applies the WalletCurrency migration and the
#    wallet backfill, exactly as on Render.
# 4. Checks: migration recorded, column added, right currencies filled in, the wallet
#    holding money left alone, not one balance or amount changed, API healthy.
set -uo pipefail
DB="$1"; CS="$2"; PORT="$3"; LOG="$4"
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
PREV=20261106200157_ClientIdentities
# A failed query prints a unique marker: two failures can never "match" in a check.
q() { psql "$DB" -XAtqc "$1" || { echo "QUERY-FAILED-$RANDOM$RANDOM"; return 1; }; }
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "PASS  $1"; else fail=$((fail+1)); echo "FAIL  $1"; echo "        expected [$3], got [$2]"; fi; }

cd "$HERE"
export PATH="$PATH:$HOME/.dotnet/tools"
echo "== schema as before this release (up to $PREV)"
dotnet ef database update "$PREV" -p src/SARIFF.Infrastructure -s src/SARIFF.API --connection "$CS" --no-build --configuration Release \
  >"$LOG.ef" 2>&1 || { tail -30 "$LOG.ef"; echo "FAIL  could not build the old schema"; exit 1; }
check "Old schema has no wallet Currency column yet" \
  "$(q "SELECT count(*) FROM information_schema.columns WHERE table_name='MpesaAgents' AND column_name='Currency'")" "0"

# Insert a row filling every NOT NULL column the test doesn't care about with a neutral value.
q "CREATE OR REPLACE FUNCTION ins(tbl text, vals jsonb) RETURNS void LANGUAGE plpgsql AS \$f\$
DECLARE cols text := ''; v text := ''; r record;
BEGIN
  FOR r IN SELECT column_name c, data_type t, is_nullable n, column_default d
           FROM information_schema.columns WHERE table_schema='public' AND table_name=tbl
           AND is_generated='NEVER' AND column_name NOT IN ('xmin') LOOP
    IF vals ? r.c THEN
      cols := cols || quote_ident(r.c) || ','; v := v || quote_nullable(vals->>r.c) || '::' || r.t || ',';
    ELSIF r.n = 'NO' AND r.d IS NULL THEN
      cols := cols || quote_ident(r.c) || ',';
      v := v || CASE
        WHEN r.t = 'uuid' THEN 'gen_random_uuid()'
        WHEN r.t IN ('integer','smallint','bigint','numeric','double precision','real') THEN '0'
        WHEN r.t = 'boolean' THEN 'false'
        WHEN r.t LIKE 'timestamp%' THEN 'now()'
        WHEN r.t = 'bytea' THEN '''\\x'''
        ELSE quote_literal('old-' || r.c) END || ',';
    END IF;
  END LOOP;
  EXECUTE format('INSERT INTO %I (%s) VALUES (%s)', tbl, rtrim(cols, ','), rtrim(v, ','));
END \$f\$;" || { echo "FAIL  helper"; exit 1; }

CO=11111111-0000-0000-0000-000000000001
q "SELECT ins('Companies', '{\"Id\":\"$CO\",\"Code\":\"OLD-2025-0001\",\"CodePrefix\":\"OLD\",\"Name\":\"Old Kampala Bureau\",\"BaseCurrency\":\"2\",\"IsActive\":\"true\",\"IsDeleted\":\"false\"}')" >/dev/null || { echo "FAIL  insert company"; exit 1; }
w() { q "SELECT ins('MpesaAgents', '{\"Id\":\"$1\",\"Code\":\"$2\",\"CompanyId\":\"$CO\",\"AgentName\":\"$2\",\"PhoneNumber\":\"+256700000000\",\"AgentNumber\":\"$2\",\"AgentType\":\"0\",\"Provider\":\"$3\",\"Balance\":\"$4\",\"OpeningBalance\":\"$4\",\"IsActive\":\"true\",\"IsDeleted\":\"false\"}')" >/dev/null; }
w 22222222-0000-0000-0000-000000000001 OLD-MP-EMPTY 0 0         # M-Pesa, never used -> KES
w 22222222-0000-0000-0000-000000000002 OLD-MP-MONEY 0 350000    # M-Pesa holding UGX for years -> left alone
w 22222222-0000-0000-0000-000000000003 OLD-MTN      1 1250000   # MTN -> UGX
q "SELECT ins('CashAccounts', '{\"Id\":\"33333333-0000-0000-0000-000000000001\",\"Code\":\"OLD-CASH\",\"CompanyId\":\"$CO\",\"Name\":\"Old till\",\"Currency\":\"2\",\"Balance\":\"4200000\",\"IsActive\":\"true\",\"IsDeleted\":\"false\"}')" >/dev/null \
  || echo "        cash till insert failed (see the error above)"
for i in 1 2 3; do
  q "SELECT ins('Transactions', '{\"CompanyId\":\"$CO\",\"Code\":\"OLD-TXN-$i\",\"Amount\":\"$((i*1000))\",\"Currency\":\"2\",\"IsDeleted\":\"false\"}')" >/dev/null
done

# Fingerprint of every balance and amount (heredoc: see restart-legacy.sh for why).
money() {
  local out
  out=$(psql "$DB" -XAtq -v ON_ERROR_STOP=1 <<'SQL'
SELECT md5(string_agg(x, ';' ORDER BY x)) || ' ' || count(*) FROM (
  SELECT 'm'||"Id"||'='||"Balance"||'/'||"OpeningBalance" x FROM "MpesaAgents"
  UNION ALL SELECT 'c'||"Id"||'='||"Balance" FROM "CashAccounts"
  UNION ALL SELECT 't'||"Id"||'='||"Amount" FROM "Transactions") s;
SQL
) || { echo "FINGERPRINT-QUERY-FAILED-$RANDOM$RANDOM"; return; }  # two failures never compare equal
  echo "$out"
}
before=$(money); rows=$(q 'SELECT count(*) FROM "MpesaAgents"'); txns=$(q 'SELECT count(*) FROM "Transactions"')
echo "old data: $rows wallets, $txns transactions, money fingerprint $before"
check "Old data is in place (3 wallets)" "$rows" "3"
check "Old cash till and transactions are in place" "$(q 'SELECT count(*) FROM "CashAccounts"')/$txns" "1/3"
check "Money fingerprint covers real data (md5 of 7 values)" "$(echo "$before" | awk '{print (length($1)==32 && $2==7) ? "yes" : "no: " $0}')" "yes"

echo "== start the NEW API on it (start-up migrates + backfills, as on Render)"
( cd src/SARIFF.API && PORT="$PORT" ASPNETCORE_ENVIRONMENT=Development ConnectionStrings__DefaultConnection="$CS" \
    nohup dotnet bin/Release/net8.0/SARIFF.API.dll >"$LOG" 2>&1 & )
ok=no; for i in $(seq 1 120); do curl -sf "http://127.0.0.1:$PORT/health" >/dev/null && { ok=yes; break; }; sleep 1; done
check "API starts on the upgraded database" "$ok" "yes"
[ "$ok" = yes ] || tail -40 "$LOG"

check "WalletCurrency migration recorded" "$(q "SELECT count(*) FROM \"__EFMigrationsHistory\" WHERE \"MigrationId\" LIKE '%_WalletCurrency'")" "1"
check "No migration left pending (history = 3 entries)" "$(q 'SELECT count(*) FROM "__EFMigrationsHistory"')" "3"
cur() { q "SELECT coalesce(\"Currency\"::text,'NULL') FROM \"MpesaAgents\" WHERE \"Code\"='$1'"; }
check "Unused old M-Pesa wallet -> KES" "$(cur OLD-MP-EMPTY)" "0"
check "Old M-Pesa wallet holding 350,000 is NOT relabelled (still home UGX)" "$(cur OLD-MP-MONEY)" "NULL"
check "Old MTN wallet -> UGX" "$(cur OLD-MTN)" "2"
check "Not one balance or amount changed in the upgrade" "$(money)" "$before"
check "No wallet or transaction lost" "$(q 'SELECT count(*) FROM "MpesaAgents"')/$(q 'SELECT count(*) FROM "Transactions"')" "$rows/$txns"
check "Start-up log has no errors" "$(grep -cE '\[(ERR|FTL)\]|Unhandled exception' "$LOG")" "0"
grep -E '\[(ERR|FTL)\]|Unhandled exception' "$LOG" | head -5

pkill -f "SARIFF.API.dll" 2>/dev/null
echo; echo "UPGRADE: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
