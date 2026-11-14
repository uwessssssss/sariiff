#!/usr/bin/env bash
# Stops the API started by ci-api.sh the way a server stop does (SIGTERM, graceful), and when
# it ran under dotnet-coverage waits for the coverage report to be written.
#   bash tests/stop-api.sh [coverage-file]
OUT="${1:-}"
PID=$(pgrep -f "^dotnet bin/Release/net8.0/SARIFF.API.dll" | head -1)
[ -n "$PID" ] && kill -TERM "$PID"
for i in $(seq 1 90); do
  pgrep -f "SARIFF.API.dll" >/dev/null || break
  sleep 1
done
if [ -n "$OUT" ]; then
  for i in $(seq 1 60); do [ -s "$OUT" ] && break; sleep 1; done
  [ -s "$OUT" ] && echo "coverage written: $OUT ($(wc -c <"$OUT") bytes)" || { echo "no coverage report at $OUT"; exit 1; }
fi
