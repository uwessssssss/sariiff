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
# App start-up time (cold start, 3 runs): what a user waits for after tapping the icon.
echo "app size: $(du -h "$APK" | cut -f1)"
for i in 1 2 3; do
  adb shell am force-stop com.sariff.mobile >/dev/null 2>&1; sleep 2
  adb shell am start -W -n com.sariff.mobile/.MainActivity 2>/dev/null | grep -E "TotalTime" | sed "s/^/cold start $i: /"
done
adb shell am force-stop com.sariff.mobile >/dev/null 2>&1
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
for flow in office.yaml office-screens.yaml client.yaml client-screens.yaml; do
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
# Maestro writes takeScreenshot images next to the flows; keep them with the results.
# (with --test-output-dir they land in a folder under $OUT instead — collect from both)
mkdir -p "$OUT/screens"
find . "$OUT" -name '*.png' -not -path "$OUT/screens/*" -exec mv -f {} "$OUT/screens/" \; 2>/dev/null
echo "screenshots: $(ls "$OUT/screens" 2>/dev/null | wc -l)"
adb shell dumpsys meminfo com.sariff.mobile 2>/dev/null | grep -E "TOTAL PSS|TOTAL:" | head -2 | sed "s/^/memory: /"
adb logcat -d > "$OUT/logcat.txt" 2>/dev/null
if [ $rc -ne 0 ]; then
  echo "================ what is on the phone screen now ================"
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb shell cat /sdcard/ui.xml \
    | grep -oE '(text|content-desc)="[^"]+"' | sed 's/^/  /' | head -80
  echo "================ app log (JS + crashes) ================"
  grep -E "ReactNativeJS|AndroidRuntime|FATAL EXCEPTION|com.sariff.mobile" "$OUT/logcat.txt" | tail -80
  adb shell dumpsys activity activities | grep -E "mResumedActivity|topResumedActivity" | head -3
fi
# Shut the emulator down ourselves. After passing runs the emulator sometimes never
# exits on "emu kill", and the job then hangs until GitHub's 75-minute limit (Nov 2026).
adb emu kill >/dev/null 2>&1
for i in $(seq 1 30); do pgrep -f qemu-system >/dev/null || break; sleep 2; done
pgrep -f qemu-system >/dev/null && { echo "emulator did not exit — force-stopping it"; pkill -9 -f qemu-system; }
exit $rc
