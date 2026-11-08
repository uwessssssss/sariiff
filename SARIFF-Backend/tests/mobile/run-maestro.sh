#!/usr/bin/env bash
# Runs inside the Android emulator job: install the APK, run the Maestro flows.
set -uo pipefail
APK="$1"; STATE="$2"; OUT="$3"
mkdir -p "$OUT"
adb wait-for-device
for i in $(seq 1 60); do [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = 1 ] && break; sleep 2; done
# The emulator's own home screen (Pixel Launcher) stalls on CI and its "isn't responding"
# dialog then covers our app. The test never needs it: switch it off, close any dialog.
for p in com.google.android.apps.nexuslauncher com.android.launcher3; do adb shell pm disable-user --user 0 "$p" >/dev/null 2>&1; done
adb shell settings put global hide_error_dialogs 1 >/dev/null 2>&1
# a phone in Nairobi/Kampala: times on screen must read as East Africa Time
adb shell settings put global auto_time_zone 0 >/dev/null 2>&1
adb shell service call alarm 3 s16 Africa/Nairobi >/dev/null 2>&1 || adb shell setprop persist.sys.timezone Africa/Nairobi
echo "phone time zone: $(adb shell getprop persist.sys.timezone)  phone clock: $(adb shell date)"
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1
sleep 5
adb install -r "$APK" || exit 1
j() { node -e "console.log(require('$STATE')$1)"; }
export PATH="$HOME/.maestro/bin:$PATH"
cd "$(dirname "$0")"
echo "deposit should show as: $(node -e 'const d=new Date(Date.parse(require(process.argv[1]).depositAt)+3*3600e3);console.log(d.toISOString())' "$STATE") (EAT)"
screen() {
  echo "================ $1: what is on the phone screen ================"
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb shell cat /sdcard/ui.xml \
    | grep -oE '(text|content-desc)="[^"]+"' | sed 's/^/  /' | head -70
}
rc=0
for flow in office.yaml client.yaml; do
  maestro test --format junit --output "$OUT/${flow%.yaml}.xml" --test-output-dir "$OUT" \
  -e UG_CODE="$(j .ugOffice.code)" -e UG_PHONE="$(j .ugOffice.phone)" -e UG_PASS="$(j .ugOffice.password)" \
  -e CL_PHONE="$(j .client.phone)" \
  -e DEP_TIME="$(node -e '
      const d = new Date(Date.parse(require(process.argv[1]).depositAt) + 3 * 3600e3);
      const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()];
      const h = d.getUTCHours() % 12 || 12, mm = String(d.getUTCMinutes()).padStart(2, "0");
      console.log(`${m} ${d.getUTCDate()}, ${h}:${mm}.${d.getUTCHours() < 12 ? "AM" : "PM"}`);' "$STATE")" \
  "$flow"
  r=$?
  [ $r -ne 0 ] && { rc=$r; screen "$flow"; }
done
true
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
