#!/usr/bin/env bash
# Runs inside the Android emulator job: install the APK, run the Maestro flows.
set -uo pipefail
APK="$1"; STATE="$2"; OUT="$3"
mkdir -p "$OUT"
adb install -r "$APK" || exit 1
j() { node -e "console.log(require('$STATE')$1)"; }
export PATH="$HOME/.maestro/bin:$PATH"
cd "$(dirname "$0")"
maestro test --format junit --output "$OUT/maestro.xml" --test-output-dir "$OUT" \
  -e UG_CODE="$(j .ugOffice.code)" -e UG_PHONE="$(j .ugOffice.phone)" -e UG_PASS="$(j .ugOffice.password)" \
  -e CL_PHONE="$(j .client.phone)" \
  office.yaml client.yaml
rc=$?
adb logcat -d -s ReactNativeJS:V ReactNative:V AndroidRuntime:E > "$OUT/logcat.txt" 2>/dev/null
grep -E "FATAL|AndroidRuntime" "$OUT/logcat.txt" | head -20
exit $rc
