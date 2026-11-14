#!/usr/bin/env bash
# SARIFF backup drill: back up the database the tests just filled, restore it into a new
# database, and prove every table, row and balance came back.
#   bash tests/deep/backup-drill.sh <database>
set -u
DB="$1"; pass=0; fail=0
ok() { echo "PASS  $1"; pass=$((pass+1)); }; bad() { echo "FAIL  $1"; echo "        $2"; fail=$((fail+1)); }
export PGPASSWORD=test; H="-h localhost -U postgres"
pg_dump $H -Fc -d "$DB" -f /tmp/drill.dump && ok "Backup taken ($(du -h /tmp/drill.dump | cut -f1))" || bad "Backup taken" "pg_dump failed"
psql $H -qc "DROP DATABASE IF EXISTS drill_restore" -c "CREATE DATABASE drill_restore" postgres
pg_restore $H -d drill_restore --no-owner /tmp/drill.dump 2>/tmp/restore.err && ok "Restored into a new database" || bad "Restore" "$(head -5 /tmp/restore.err)"
counts() { psql $H -XAtq -d "$1" -c "SELECT string_agg(t || '=' || n, ' ' ORDER BY t) FROM (SELECT table_name t, (xpath('/row/c/text()', query_to_xml(format('select count(*) c from %I', table_name), false, true, '')))[1]::text::int n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') x"; }
money() { psql $H -XAtq -d "$1" <<'SQL'
SELECT md5(string_agg(x, '|' ORDER BY x)) FROM (
  SELECT 'cash'||"Id"||':'||"Balance" x FROM "CashAccounts" UNION ALL
  SELECT 'bank'||"Id"||':'||"Balance" FROM "BankAccounts" UNION ALL
  SELECT 'wallet'||"Id"||':'||"Balance" FROM "MpesaAgents" UNION ALL
  SELECT 'client'||"ClientId"||':'||"Currency"||':'||"Balance" FROM "ClientCurrencyBalances" UNION ALL
  SELECT 'user'||"Id"||':'||"BalanceKES"||':'||"BalanceUSD" FROM "Users" UNION ALL
  SELECT 'txn'||"Id"||':'||"Amount" FROM "Transactions") s;
SQL
}
a=$(counts "$DB"); b=$(counts drill_restore)
[ -n "$a" ] && [ "$a" = "$b" ] && ok "Every table has the same row count ($(echo "$a" | wc -w) tables)" || bad "Row counts match" "original: ${a:0:300} | restored: ${b:0:300}"
m1=$(money "$DB" 2>&1); m2=$(money drill_restore 2>&1)
[ -n "$m1" ] && [ "$m1" = "$m2" ] && ! echo "$m1" | grep -q ERROR && ok "Every balance and transaction amount identical (fingerprint $m1)" || bad "Money fingerprint matches" "original $m1 | restored $m2"
mig=$(psql $H -XAtq -d drill_restore -c 'SELECT count(*) FROM "__EFMigrationsHistory"')
[ "${mig:-0}" -ge 1 ] && ok "Migration history restored ($mig entries) — the API can start on it" || bad "Migration history restored" "$mig"
echo; echo "BACKUP DRILL: $pass passed, $fail failed"; [ $fail = 0 ]
