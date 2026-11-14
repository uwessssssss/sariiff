#!/usr/bin/env bash
# Scans the API log after every test: unhandled exceptions, 500s and leaked secrets fail.
#   bash logscan.sh <api.log>
LOG="$1"
ex=$(grep -cE "An unhandled exception|fail: Microsoft.AspNetCore|Unhandled exception" "$LOG" || true)
s5=$(grep -cE "responded 5[0-9][0-9]|StatusCode: 5[0-9][0-9]" "$LOG" || true)
sec=$(grep -ciE "password=|Bearer ey|apikey=" "$LOG" || true)
echo "API LOG: $(wc -l <"$LOG") lines; unhandled exceptions $ex; 5xx responses $s5; secret-looking lines $sec"
if [ "$ex" != 0 ]; then grep -nE -A6 "An unhandled exception|fail: Microsoft.AspNetCore|Unhandled exception" "$LOG" | head -120; fi
if [ "$sec" != 0 ]; then grep -niE "password=|Bearer ey|apikey=" "$LOG" | sed -E 's/(password=|apikey=|Bearer )[^ ;"]*/\1***/Ig' | head -20; fi
[ "$ex" = 0 ] && [ "$sec" = 0 ]
