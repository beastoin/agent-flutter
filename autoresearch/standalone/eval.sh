#!/usr/bin/env bash
# Eval harness for agent-flutter standalone CLI.
# Usage: bash autoresearch/standalone/eval.sh
# DO NOT MODIFY THIS FILE.

set -uo pipefail
cd "$(dirname "$0")/../.."

export PATH="/home/claude/tools/node/bin:$HOME/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export NODE_OPTIONS="--experimental-strip-types"

AGENT_FLUTTER_DIR="autoresearch/standalone/agent-flutter"

echo "---"

json_check() {
  local file="$1"
  local mode="$2"

  node - "$file" "$mode" <<'NODE'
const fs = require('fs');

const file = process.argv[2];
const mode = process.argv[3];

let raw = '';
try {
  raw = fs.readFileSync(file, 'utf8').trim();
} catch {
  process.exit(1);
}

if (!raw) process.exit(1);

let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  process.exit(1);
}

const requiredCommands = [
  'connect',
  'disconnect',
  'status',
  'snapshot',
  'press',
  'fill',
  'get',
  'find',
  'wait',
  'is',
  'scroll',
  'swipe',
  'back',
  'home',
  'screenshot',
  'reload',
  'logs',
  'schema',
];

if (mode === 'json') {
  process.exit(0);
}

if (mode === 'array') {
  process.exit(Array.isArray(parsed) ? 0 : 1);
}

if (mode === 'schema-list') {
  if (!Array.isArray(parsed) || parsed.length === 0) process.exit(1);
  const names = parsed
    .map((entry) => (entry && typeof entry === 'object' ? entry.name : undefined))
    .filter((name) => typeof name === 'string');
  const ok = requiredCommands.every((name) => names.includes(name));
  process.exit(ok ? 0 : 1);
}

if (mode === 'schema-press') {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) process.exit(1);
  if (parsed.name !== 'press') process.exit(1);
  if (typeof parsed.description !== 'string' || parsed.description.length === 0) process.exit(1);
  if (!Array.isArray(parsed.args)) process.exit(1);
  if (!Array.isArray(parsed.flags)) process.exit(1);
  if (!parsed.exitCodes || typeof parsed.exitCodes !== 'object' || Array.isArray(parsed.exitCodes)) process.exit(1);
  process.exit(0);
}

process.exit(1);
NODE
}

# Detect phase
PHASE=1
if [ -f "$AGENT_FLUTTER_DIR/src/commands/press.ts" ]; then
  PHASE=2
fi
if [ -f "$AGENT_FLUTTER_DIR/src/commands/screenshot.ts" ]; then
  PHASE=3
fi
if [ -f "$AGENT_FLUTTER_DIR/src/commands/wait.ts" ]; then
  PHASE=4
fi
if [ -f "$AGENT_FLUTTER_DIR/src/command-schema.ts" ]; then
  PHASE=5
fi
echo "phase:            $PHASE"

# Step 1: Build check (TypeScript compiles)
BUILD_STATUS="pass"
if [ -f "$AGENT_FLUTTER_DIR/package.json" ]; then
  if (cd "$AGENT_FLUTTER_DIR" && npx tsc --noEmit > /tmp/af-eval-build.log 2>&1); then
    BUILD_STATUS="pass"
  else
    BUILD_STATUS="fail"
  fi
else
  BUILD_STATUS="no_package"
fi
echo "build:            $BUILD_STATUS"

# Step 2: Unit tests
TEST_STATUS="no_tests"
TEST_COUNT="0"
if [ -d "$AGENT_FLUTTER_DIR/__tests__" ]; then
  TEST_FILES=$(find "$AGENT_FLUTTER_DIR/__tests__" -name '*.test.ts' 2>/dev/null)
  if [ -n "$TEST_FILES" ]; then
    if node --test $TEST_FILES > /tmp/af-eval-tests.log 2>&1; then
      TEST_STATUS="pass"
      TEST_COUNT=$(grep -cE "^ok |# pass" /tmp/af-eval-tests.log 2>/dev/null || echo "0")
    else
      TEST_STATUS="fail"
      TEST_COUNT=$(grep -cE "^not ok|# fail" /tmp/af-eval-tests.log 2>/dev/null || echo "0")
    fi
  fi
fi
echo "tests:            $TEST_STATUS ($TEST_COUNT)"

# Step 2b: Phase 5 contract tests
CONTRACT_STATUS="skip"
if [ "$PHASE" -ge 5 ]; then
  if [ -f "$AGENT_FLUTTER_DIR/__tests__/contract.test.ts" ]; then
    if node --test "$AGENT_FLUTTER_DIR/__tests__/contract.test.ts" > /tmp/af-eval-contract.log 2>&1; then
      CONTRACT_STATUS="pass"
    else
      CONTRACT_STATUS="fail"
    fi
  else
    CONTRACT_STATUS="missing"
  fi
fi
echo "contract_tests:   $CONTRACT_STATUS"

# Step 3: CLI smoke test (does it run without crashing?)
CLI_STATUS="skip"
CLI_ENTRY=""
CLI_CMD=()
if [ -f "$AGENT_FLUTTER_DIR/bin/agent-flutter.mjs" ]; then
  CLI_ENTRY="node $AGENT_FLUTTER_DIR/bin/agent-flutter.mjs"
  CLI_CMD=(node "$AGENT_FLUTTER_DIR/bin/agent-flutter.mjs")
elif [ -f "$AGENT_FLUTTER_DIR/src/cli.ts" ]; then
  CLI_ENTRY="node --experimental-strip-types $AGENT_FLUTTER_DIR/src/cli.ts"
  CLI_CMD=(node --experimental-strip-types "$AGENT_FLUTTER_DIR/src/cli.ts")
fi

if [ "${#CLI_CMD[@]}" -gt 0 ]; then
  if "${CLI_CMD[@]}" --help > /tmp/af-eval-cli.log 2>&1; then
    CLI_STATUS="pass"
  else
    CLI_STATUS="fail"
  fi
fi
echo "cli_smoke:        $CLI_STATUS"

# Step 3b: Phase 4 CLI checks (new commands in help, per-command help, exit codes)
P4_CLI_STATUS="skip"
if [ "$PHASE" -ge 4 ] && [ "$CLI_STATUS" = "pass" ] && [ "${#CLI_CMD[@]}" -gt 0 ]; then
  P4_PASS=0
  P4_TOTAL=0

  # Check help lists new commands
  for CMD in wait is scroll swipe back home; do
    P4_TOTAL=$((P4_TOTAL + 1))
    if grep -qi "$CMD" /tmp/af-eval-cli.log 2>/dev/null; then
      P4_PASS=$((P4_PASS + 1))
    fi
  done

  # Check per-command --help works
  for CMD in press fill snapshot wait is scroll swipe; do
    P4_TOTAL=$((P4_TOTAL + 1))
    if "${CLI_CMD[@]}" "$CMD" --help > /dev/null 2>&1; then
      P4_PASS=$((P4_PASS + 1))
    fi
  done

  # Check snapshot -i flag accepted
  P4_TOTAL=$((P4_TOTAL + 1))
  if "${CLI_CMD[@]}" snapshot --help 2>&1 | grep -qi "interactive\|\-i"; then
    P4_PASS=$((P4_PASS + 1))
  fi

  # Check errors.ts exists
  P4_TOTAL=$((P4_TOTAL + 1))
  if [ -f "$AGENT_FLUTTER_DIR/src/errors.ts" ]; then
    P4_PASS=$((P4_PASS + 1))
  fi

  if [ "$P4_PASS" -eq "$P4_TOTAL" ]; then
    P4_CLI_STATUS="pass"
  else
    P4_CLI_STATUS="fail ($P4_PASS/$P4_TOTAL)"
  fi
fi
echo "p4_cli:           $P4_CLI_STATUS"

# Step 3c: Phase 5 checks
P5_STATUS="skip"
if [ "$PHASE" -ge 5 ] && [ "$CLI_STATUS" = "pass" ] && [ "${#CLI_CMD[@]}" -gt 0 ]; then
  P5_PASS=0
  P5_TOTAL=0

  # Required files
  P5_TOTAL=$((P5_TOTAL + 1))
  if [ -f "$AGENT_FLUTTER_DIR/src/command-schema.ts" ]; then
    P5_PASS=$((P5_PASS + 1))
  fi

  P5_TOTAL=$((P5_TOTAL + 1))
  if [ -f "$AGENT_FLUTTER_DIR/src/validate.ts" ]; then
    P5_PASS=$((P5_PASS + 1))
  fi

  P5_TOTAL=$((P5_TOTAL + 1))
  if [ -f "$AGENT_FLUTTER_DIR/AGENTS.md" ]; then
    P5_PASS=$((P5_PASS + 1))
  fi

  # Contract tests exist+pass
  P5_TOTAL=$((P5_TOTAL + 1))
  if [ "$CONTRACT_STATUS" = "pass" ]; then
    P5_PASS=$((P5_PASS + 1))
  fi

  # schema command returns JSON array with all command names
  P5_TOTAL=$((P5_TOTAL + 1))
  if "${CLI_CMD[@]}" schema > /tmp/af-eval-schema.log 2>&1 && json_check /tmp/af-eval-schema.log schema-list; then
    P5_PASS=$((P5_PASS + 1))
  fi

  # schema <cmd> returns valid JSON object for press
  P5_TOTAL=$((P5_TOTAL + 1))
  if "${CLI_CMD[@]}" schema press > /tmp/af-eval-schema-press.log 2>&1 && json_check /tmp/af-eval-schema-press.log schema-press; then
    P5_PASS=$((P5_PASS + 1))
  fi

  # --dry-run accepted on press
  P5_TOTAL=$((P5_TOTAL + 1))
  "${CLI_CMD[@]}" --json press @e1 --dry-run > /tmp/af-eval-dryrun.log 2>&1
  DRY_RUN_EC=$?
  if [ "$DRY_RUN_EC" -eq 0 ] || [ "$DRY_RUN_EC" -eq 2 ]; then
    if grep -qiE "unknown option|unknown flag|unexpected argument.*--dry-run|invalid.*--dry-run" /tmp/af-eval-dryrun.log 2>/dev/null; then
      :
    else
      P5_PASS=$((P5_PASS + 1))
    fi
  fi

  # AGENT_FLUTTER_JSON env var should force JSON output
  P5_TOTAL=$((P5_TOTAL + 1))
  AGENT_FLUTTER_JSON=1 "${CLI_CMD[@]}" status > /tmp/af-eval-env-json.log 2>&1 || true
  if json_check /tmp/af-eval-env-json.log json; then
    P5_PASS=$((P5_PASS + 1))
  fi

  if [ "$P5_PASS" -eq "$P5_TOTAL" ]; then
    P5_STATUS="pass"
  else
    P5_STATUS="fail ($P5_PASS/$P5_TOTAL)"
  fi
fi
echo "p5_checks:        $P5_STATUS"

# Step 4: E2E test (connect to real Flutter app if available)
E2E_STATUS="skip"
E2E_COUNT="0"
if [ -f "autoresearch/standalone/e2e-test.ts" ]; then
  # Check if emulator is running and app is up
  if adb devices 2>/dev/null | grep -q "emulator-5554"; then
    VM_LINE=$(adb -s emulator-5554 logcat -d -s flutter 2>/dev/null | grep -o "http://127\.0\.0\.1:[0-9]*/[^/]*/" | tail -1)
    if [ -n "$VM_LINE" ]; then
      VM_PORT=$(echo "$VM_LINE" | grep -oP ':\K[0-9]+' | head -1)
      adb -s emulator-5554 forward tcp:$VM_PORT tcp:$VM_PORT 2>/dev/null || true
      WS_URI=$(echo "$VM_LINE" | sed 's|^http://|ws://|')ws
      if VM_SERVICE_URI="$WS_URI" AGENT_FLUTTER="$AGENT_FLUTTER_DIR" node --test autoresearch/standalone/e2e-test.ts > /tmp/af-eval-e2e.log 2>&1; then
        E2E_STATUS="pass"
        E2E_COUNT=$(grep -cE "^ok |# pass" /tmp/af-eval-e2e.log 2>/dev/null || echo "0")
      else
        E2E_STATUS="fail"
        E2E_COUNT=$(grep -cE "^not ok|# fail" /tmp/af-eval-e2e.log 2>/dev/null || echo "0")
      fi
    else
      E2E_STATUS="no_vm_service"
    fi
  else
    E2E_STATUS="no_emulator"
  fi
else
  E2E_STATUS="no_test"
fi
echo "e2e:              $E2E_STATUS ($E2E_COUNT)"

# Step 5: Snapshot format check
FMT_STATUS="skip"
if [ "$E2E_STATUS" = "pass" ] || [ "$CLI_STATUS" = "pass" ]; then
  if grep -qE '@e[0-9]+ \[' /tmp/af-eval-e2e.log /tmp/af-eval-cli.log 2>/dev/null || \
     grep -qE '"ref"\s*:\s*"e[0-9]+"' /tmp/af-eval-e2e.log /tmp/af-eval-cli.log 2>/dev/null; then
    FMT_STATUS="pass"
  else
    FMT_STATUS="fail"
  fi
fi
echo "snapshot_format:  $FMT_STATUS"

# Step 6: Exit code check (Phase 4+ only)
EXIT_CODE_STATUS="skip"
if [ "$PHASE" -ge 4 ] && [ "${#CLI_CMD[@]}" -gt 0 ]; then
  EC_PASS=0
  EC_TOTAL=0

  # Unknown command should exit 2
  EC_TOTAL=$((EC_TOTAL + 1))
  "${CLI_CMD[@]}" nonexistent_cmd > /dev/null 2>&1
  if [ $? -eq 2 ]; then
    EC_PASS=$((EC_PASS + 1))
  fi

  # is exists on unknown ref should be 1 or 2 depending on session state
  EC_TOTAL=$((EC_TOTAL + 1))
  "${CLI_CMD[@]}" is exists @e99999 > /dev/null 2>&1
  EC=$?
  if [ $EC -eq 1 ] || [ $EC -eq 2 ]; then
    EC_PASS=$((EC_PASS + 1))
  fi

  if [ "$EC_PASS" -eq "$EC_TOTAL" ]; then
    EXIT_CODE_STATUS="pass"
  else
    EXIT_CODE_STATUS="fail ($EC_PASS/$EC_TOTAL)"
  fi
fi
echo "exit_codes:       $EXIT_CODE_STATUS"

# Line counts
TOTAL_FILES="0"
TOTAL_LINES="0"
if [ -d "$AGENT_FLUTTER_DIR/src" ]; then
  TOTAL_FILES=$(find "$AGENT_FLUTTER_DIR/src" -name '*.ts' 2>/dev/null | wc -l)
  TOTAL_LINES=$(find "$AGENT_FLUTTER_DIR/src" -name '*.ts' 2>/dev/null -exec cat {} + 2>/dev/null | wc -l)
fi
echo "files:            $TOTAL_FILES"
echo "lines:            $TOTAL_LINES"

# Phase gate
PHASE_COMPLETE="no"
if [ "$BUILD_STATUS" = "pass" ] && [ "$TEST_STATUS" = "pass" ]; then
  case $PHASE in
    1)
      if [ -f "$AGENT_FLUTTER_DIR/src/commands/connect.ts" ] && \
         [ -f "$AGENT_FLUTTER_DIR/src/commands/snapshot.ts" ] && \
         [ -f "$AGENT_FLUTTER_DIR/src/session.ts" ] && \
         [ "$CLI_STATUS" = "pass" ]; then
        PHASE_COMPLETE="yes"
      fi
      ;;
    2)
      if [ -f "$AGENT_FLUTTER_DIR/src/commands/press.ts" ] && \
         [ -f "$AGENT_FLUTTER_DIR/src/commands/fill.ts" ] && \
         [ -f "$AGENT_FLUTTER_DIR/src/commands/find.ts" ] && \
         [ "$E2E_STATUS" = "pass" ]; then
        PHASE_COMPLETE="yes"
      fi
      ;;
    3)
      if [ -f "$AGENT_FLUTTER_DIR/src/commands/screenshot.ts" ] && \
         [ "$E2E_STATUS" = "pass" ] && \
         [ "$FMT_STATUS" = "pass" ]; then
        PHASE_COMPLETE="yes"
      fi
      ;;
    4)
      if [ -f "$AGENT_FLUTTER_DIR/src/commands/wait.ts" ] && \
         [ -f "$AGENT_FLUTTER_DIR/src/commands/is.ts" ] && \
         [ -f "$AGENT_FLUTTER_DIR/src/commands/scroll.ts" ] && \
         [ -f "$AGENT_FLUTTER_DIR/src/commands/swipe.ts" ] && \
         [ -f "$AGENT_FLUTTER_DIR/src/commands/back.ts" ] && \
         [ -f "$AGENT_FLUTTER_DIR/src/commands/home.ts" ] && \
         [ -f "$AGENT_FLUTTER_DIR/src/errors.ts" ] && \
         [ "$E2E_STATUS" = "pass" ] && \
         [ "$P4_CLI_STATUS" = "pass" ] && \
         [ "$EXIT_CODE_STATUS" = "pass" ] && \
         [ "$FMT_STATUS" = "pass" ]; then
        PHASE_COMPLETE="yes"
      fi
      ;;
    5)
      if [ -f "$AGENT_FLUTTER_DIR/src/commands/wait.ts" ] && \
         [ -f "$AGENT_FLUTTER_DIR/src/commands/is.ts" ] && \
         [ -f "$AGENT_FLUTTER_DIR/src/commands/scroll.ts" ] && \
         [ -f "$AGENT_FLUTTER_DIR/src/commands/swipe.ts" ] && \
         [ -f "$AGENT_FLUTTER_DIR/src/commands/back.ts" ] && \
         [ -f "$AGENT_FLUTTER_DIR/src/commands/home.ts" ] && \
         [ -f "$AGENT_FLUTTER_DIR/src/errors.ts" ] && \
         [ -f "$AGENT_FLUTTER_DIR/src/command-schema.ts" ] && \
         [ -f "$AGENT_FLUTTER_DIR/src/validate.ts" ] && \
         [ -f "$AGENT_FLUTTER_DIR/AGENTS.md" ] && \
         [ "$CONTRACT_STATUS" = "pass" ] && \
         [ "$E2E_STATUS" = "pass" ] && \
         [ "$P4_CLI_STATUS" = "pass" ] && \
         [ "$P5_STATUS" = "pass" ] && \
         [ "$EXIT_CODE_STATUS" = "pass" ] && \
         [ "$FMT_STATUS" = "pass" ]; then
        PHASE_COMPLETE="yes"
      fi
      ;;
  esac
fi
echo "phase_complete:   $PHASE_COMPLETE"
echo "---"

