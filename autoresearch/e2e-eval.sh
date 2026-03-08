#!/usr/bin/env bash
# E2E eval harness: build Flutter test app, launch on emulator, run e2e tests.
# Usage: bash autoresearch/e2e-eval.sh
# DO NOT MODIFY THIS FILE.

set -uo pipefail
cd "$(dirname "$0")/.."

export PATH="/home/claude/tools/node/bin:$HOME/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export NODE_OPTIONS="--experimental-strip-types"

FLUTTER_APP_DIR="autoresearch/e2e-flutter-app"
E2E_TEST="autoresearch/e2e-test.ts"
LOG_DIR="autoresearch/e2e-logs"
mkdir -p "$LOG_DIR"

echo "---"

# Step 1: Check emulator
EMULATOR_STATUS="fail"
if adb devices 2>/dev/null | grep -q "emulator-5554"; then
  EMULATOR_STATUS="pass"
fi
echo "emulator:         $EMULATOR_STATUS"
if [ "$EMULATOR_STATUS" = "fail" ]; then
  echo "app_build:        skip"
  echo "app_install:      skip"
  echo "vm_service:       skip"
  echo "e2e_tests:        skip (0)"
  echo "---"
  exit 1
fi

# Step 2: Build Flutter app (debug APK)
APP_BUILD="fail"
if [ ! -f "$FLUTTER_APP_DIR/build/app/outputs/flutter-apk/app-debug.apk" ]; then
  echo "Building Flutter test app (first time)..."
  if (cd "$FLUTTER_APP_DIR" && flutter pub get > "$LOG_DIR/pub-get.log" 2>&1 && flutter build apk --debug > "$LOG_DIR/build.log" 2>&1); then
    APP_BUILD="pass"
  else
    echo "  Build failed. See $LOG_DIR/build.log"
  fi
else
  # Rebuild only if main.dart changed
  if [ "$FLUTTER_APP_DIR/lib/main.dart" -nt "$FLUTTER_APP_DIR/build/app/outputs/flutter-apk/app-debug.apk" ]; then
    if (cd "$FLUTTER_APP_DIR" && flutter build apk --debug > "$LOG_DIR/build.log" 2>&1); then
      APP_BUILD="pass"
    fi
  else
    APP_BUILD="pass"
  fi
fi
echo "app_build:        $APP_BUILD"
if [ "$APP_BUILD" = "fail" ]; then
  echo "app_install:      skip"
  echo "vm_service:       skip"
  echo "e2e_tests:        skip (0)"
  echo "---"
  exit 1
fi

# Step 3: Install on emulator
APP_INSTALL="fail"
if adb -s emulator-5554 install -r "$FLUTTER_APP_DIR/build/app/outputs/flutter-apk/app-debug.apk" > "$LOG_DIR/install.log" 2>&1; then
  APP_INSTALL="pass"
fi
echo "app_install:      $APP_INSTALL"
if [ "$APP_INSTALL" = "fail" ]; then
  echo "vm_service:       skip"
  echo "e2e_tests:        skip (0)"
  echo "---"
  exit 1
fi

# Step 4: Launch app and capture VM Service URI
# Kill any existing instance
adb -s emulator-5554 shell am force-stop com.example.marionette_test_app 2>/dev/null

# Clear logcat
adb -s emulator-5554 logcat -c 2>/dev/null

# Launch the app
adb -s emulator-5554 shell am start -n com.example.marionette_test_app/.MainActivity > "$LOG_DIR/launch.log" 2>&1

# Wait for VM Service URI in logcat (up to 30 seconds)
VM_URI=""
VM_STATUS="fail"
for i in $(seq 1 30); do
  VM_LINE=$(adb -s emulator-5554 logcat -d -s flutter 2>/dev/null | grep -o "http://127\.0\.0\.1:[0-9]*/[^/]*/" | head -1)
  if [ -n "$VM_LINE" ]; then
    VM_URI="$VM_LINE"
    VM_STATUS="pass"
    break
  fi
  sleep 1
done
echo "vm_service:       $VM_STATUS"

if [ "$VM_STATUS" = "fail" ]; then
  echo "  Could not find VM Service URI in logcat after 30s"
  echo "e2e_tests:        skip (0)"
  echo "---"
  exit 1
fi

# Extract port from URI and set up ADB port forwarding
VM_PORT=$(echo "$VM_URI" | grep -oP ':\K[0-9]+' | head -1)
echo "vm_uri:           $VM_URI"
echo "vm_port:          $VM_PORT"

# Forward the port (remove any existing forward first)
adb -s emulator-5554 forward --remove tcp:$VM_PORT 2>/dev/null || true
adb -s emulator-5554 forward tcp:$VM_PORT tcp:$VM_PORT > /dev/null 2>&1

# Convert HTTP URI to WebSocket URI for the test
WS_URI=$(echo "$VM_URI" | sed 's|^http://|ws://|')ws
echo "ws_uri:           $WS_URI"

# Step 5: Run e2e tests
E2E_STATUS="fail"
E2E_COUNT="0"
if [ -f "$E2E_TEST" ]; then
  VM_SERVICE_URI="$WS_URI" node --test "$E2E_TEST" > "$LOG_DIR/e2e.log" 2>&1
  E2E_EXIT=$?
  E2E_COUNT=$(grep -cE "^ok |# pass" "$LOG_DIR/e2e.log" 2>/dev/null || echo "0")
  E2E_FAIL=$(grep -cE "^not ok" "$LOG_DIR/e2e.log" 2>/dev/null || echo "0")
  if [ $E2E_EXIT -eq 0 ]; then
    E2E_STATUS="pass"
  else
    E2E_STATUS="fail"
  fi
  echo "e2e_tests:        $E2E_STATUS ($E2E_COUNT pass, $E2E_FAIL fail)"
else
  echo "e2e_tests:        no_test_file (0)"
fi

echo "---"
