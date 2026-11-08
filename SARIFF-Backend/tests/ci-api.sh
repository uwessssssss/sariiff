#!/usr/bin/env bash
# CI helper: build the API, add a temporary migration if the repo has none, start it on a
# fresh database and wait for /health.   bash tests/ci-api.sh <database> <port> <log>
# Needs PG_CS (Host=...;Port=...;Username=...;Password=...).
set -euo pipefail
DBNAME="$1"; PORT="$2"; LOG="$3"
cd "$(dirname "$0")/.."
dotnet restore SARIFF.sln
dotnet build SARIFF.sln --no-restore -c Release
if ! ls src/SARIFF.Infrastructure/Migrations/*_*.cs >/dev/null 2>&1; then
  echo "::warning::No migrations committed; using a temporary one for this test run."
  dotnet tool install -g dotnet-ef --version "8.*" >/dev/null 2>&1 || true
  export PATH="$PATH:$HOME/.dotnet/tools"
  dotnet ef migrations add CiTemporarySnapshot -p src/SARIFF.Infrastructure -s src/SARIFF.API
  dotnet build SARIFF.sln --no-restore -c Release
fi
( cd src/SARIFF.API && PORT="$PORT" ASPNETCORE_ENVIRONMENT=Development \
    ConnectionStrings__DefaultConnection="$PG_CS;Database=$DBNAME" \
    nohup dotnet bin/Release/net8.0/SARIFF.API.dll >"$LOG" 2>&1 & )
for i in $(seq 1 120); do curl -sf "http://127.0.0.1:$PORT/health" >/dev/null && { echo "API up on $PORT"; exit 0; }; sleep 1; done
echo "API did not start"; tail -60 "$LOG"; exit 1
