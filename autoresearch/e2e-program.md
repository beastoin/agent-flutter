# autoresearch: E2E Validation of Marionette Integration

This is an autonomous e2e validation loop. You are jin, validating your
Marionette integration against a REAL Flutter app running on the Android emulator.

## Context

Your Phase 1-3 code works against mocked WebSocket. Now you must prove it works
against a real Dart VM Service with real Marionette extensions.

## Setup

1. **Read these files**:
   - `autoresearch/e2e-program.md` — this file (your instructions)
   - `autoresearch/e2e-eval.sh` — the immutable e2e eval harness
   - `autoresearch/e2e-test.ts` — the e2e test suite
   - `autoresearch/e2e-flutter-app/lib/main.dart` — the test Flutter app
   - `src/platforms/flutter/vm-service-client.ts` — YOUR code being tested
2. **Ensure branch**: Stay on `autoresearch/marionette`
3. **Set environment**:
   ```bash
   export NODE_OPTIONS="--experimental-strip-types"
   export PATH="/home/claude/tools/node/bin:$HOME/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
   ```
4. **First run**: Execute `bash autoresearch/e2e-eval.sh > autoresearch/e2e-run.log 2>&1` and check output.

## Known Issue: Matcher Serialization

**CRITICAL BUG**: Your `serializeMatcher()` in `vm-service-client.ts` sends the wrong format.

Your code sends:
```json
{"matcher": {"type": "Key", "keyValue": "increment_btn"}}
```

Marionette expects FLAT params (from `WidgetMatcher.fromJson`):
```json
{"key": "increment_btn"}
```

The real Marionette protocol matcher format (from source code):
- Key match: `{"key": "value_key_string"}`
- Text match: `{"text": "button text"}`
- Coordinates: `{"x": "123.0", "y": "456.0"}` (NOTE: x/y are STRINGS, not numbers)
- Type match: `{"type": "WidgetTypeName"}`
- Focused: `{"focused": true}`

Your `tap()` and `enterText()` methods also wrap params in a `matcher` key —
Marionette expects the matcher fields as TOP-LEVEL params alongside `isolateId`.

So `tap` call should be:
```json
{
  "method": "ext.flutter.marionette.tap",
  "params": {
    "isolateId": "isolates/123",
    "key": "increment_btn"
  }
}
```

NOT:
```json
{
  "method": "ext.flutter.marionette.tap",
  "params": {
    "isolateId": "isolates/123",
    "matcher": {"type": "Key", "keyValue": "increment_btn"}
  }
}
```

Similarly for `enterText`, the `text` param for the content to enter is a
top-level param (same name — check Marionette source to confirm exact param name).

## The E2E Loop

1. **Run eval**: `bash autoresearch/e2e-eval.sh > autoresearch/e2e-run.log 2>&1`
2. **Check results**: `cat autoresearch/e2e-run.log`
3. **If tests fail**: Read `autoresearch/e2e-logs/e2e.log` for details
4. **Fix your code** in `src/platforms/flutter/vm-service-client.ts` (and related files)
5. **Also run unit tests**: `bash autoresearch/eval.sh` — existing tests must still pass
6. **Commit**: `git add -A && git commit -m "fix: <description>"`
7. **Log results** to `autoresearch/results.tsv`
8. **Repeat** until ALL e2e tests pass

## What to fix (expected issues)

1. **serializeMatcher** — convert to flat Marionette JSON format (key/text/x+y/type/focused)
2. **tap/enterText params** — spread matcher fields as top-level params, not nested
3. **Coordinates format** — Marionette expects x/y as strings (parseFloat in Dart)
4. **enterText params** — check if `text` param should be `value` or `text` (read Marionette source)
5. **WidgetMatcher type** — your TypeScript type may need updating to match actual wire format
6. **Any other protocol mismatches** found during e2e testing

## Acceptance Criteria

ALL must pass:
1. `e2e-eval.sh` shows: emulator=pass, app_build=pass, app_install=pass, vm_service=pass
2. ALL e2e tests pass (connect, getElements, tap by key, enterText, tap by text)
3. `eval.sh` still passes (existing unit tests not broken)
4. `serializeMatcher` produces correct wire format matching Marionette protocol

## Rules

- **NEVER STOP**: Keep fixing until all e2e tests pass or you are interrupted.
- **Fix code, not tests**: The e2e tests define the expected behavior. Fix your implementation.
- **Existing tests**: If unit tests break from your fixes, update the unit test mocks to match the new (correct) wire format. The e2e behavior is the ground truth.
- **Read Marionette source**: When unsure about protocol, check the actual Marionette source at `https://github.com/leancodepl/marionette_mcp/tree/main/packages/marionette_flutter/lib/src`
- **One fix per commit**: Keep changes incremental and reviewable.
