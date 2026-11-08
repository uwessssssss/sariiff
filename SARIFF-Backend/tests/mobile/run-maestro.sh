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
adb logcat -d > "$OUT/logcat.txt" 2>/dev/null
if [ $rc -ne 0 ]; then
  echo "================ what is on the phone screen now ================"
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb shell cat /sdcard/ui.xml \
    | grep -oE '(text|content-desc)="[^"]+"' | sed 's/^/  /' | head -80
  echo "================ app log (JS + crashes) ================"
  grep -E "ReactNativeJS|AndroidRuntime|FATAL EXCEPTION|com.sariff.mobile" "$OUT/logcat.txt" | tail -80
  adb shell dumpsys activity activities | grep -E "mResumedActivity|topResumedActivity" | head -3
fi
exit $rc
