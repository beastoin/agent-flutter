# agent-flutter — Agent Workflow Guide

## Prerequisites

Before using agent-flutter, the target Flutter app MUST have Marionette set up:

1. **Add dependency** to the Flutter app's `pubspec.yaml`:
   ```yaml
   dev_dependencies:
     marionette_flutter: ^0.3.0
   ```

2. **Initialize in `main.dart`** (debug mode only):
   ```dart
   import 'package:marionette_flutter/marionette_flutter.dart';
   void main() {
     assert(() { MarionetteBinding.ensureInitialized(); return true; }());
     runApp(const MyApp());
   }
   ```

3. **Launch via `flutter run`** (not `adb install`). The Dart VM Service is only exposed when launched through `flutter run` in debug or profile mode.

4. **ADB** must be installed and the device/emulator must be connected (`adb devices`).

Run `agent-flutter doctor` to verify all prerequisites automatically.

## Self-diagnosis

When something isn't working, run doctor first:

```bash
agent-flutter doctor        # human output
agent-flutter --json doctor # machine output
```

Doctor checks: ADB installed → device connected → Flutter app running → Marionette initialized → elements accessible → session state. Each failed check includes a `fix` field explaining exactly what to do.

## Canonical workflow

```bash
# 1) Verify setup
agent-flutter doctor

# 2) Connect
agent-flutter connect

# 3) Snapshot — get widget refs
agent-flutter snapshot -i    # interactive elements only

# 4) Interact
agent-flutter press @e3
agent-flutter fill @e5 "hello world"

# 5) Wait for UI to settle
agent-flutter wait text "Welcome" --timeout-ms 5000

# 6) Assert
agent-flutter is exists @e3   # exit 0=true, 1=false

# 7) Disconnect
agent-flutter disconnect
```

## State machine

```
[disconnected] --connect--> [connected] --snapshot--> [refs valid]
     ^                          |                         |
     |                     disconnect               press/fill/scroll
     |                          |                         |
     +----------<---------------+-------<----- [refs stale] --snapshot--> [refs valid]
```

- `press`, `fill`, `get`, `is`, `find`, `wait` require `[connected]` state.
- `press`, `fill`, `scroll`, `reload` make refs stale — re-run `snapshot` after.
- `connect` is always safe to re-run (refreshes session).

## Output shapes

### snapshot --json
```json
[
  {"ref": "e1", "type": "button", "flutterType": "FilledButton", "label": "Submit", "key": "submit_btn", "visible": true, "bounds": {"x": 100, "y": 200, "width": 150, "height": 48}},
  {"ref": "e2", "type": "textfield", "flutterType": "TextField", "label": "Email", "key": null, "visible": true, "bounds": {"x": 50, "y": 100, "width": 300, "height": 56}}
]
```

### status --json
```json
{"connected": true, "vmServiceUri": "ws://127.0.0.1:38047/abc=/ws", "isolateId": "isolates/123", "connectedAt": "2026-03-08T12:00:00Z", "refs": 5}
```

### get attrs @e1
```json
{"ref": "e1", "type": "button", "flutterType": "FilledButton", "text": "Submit", "key": "submit_btn", "visible": true, "bounds": {"x": 100, "y": 200, "width": 150, "height": 48}}
```

### doctor --json
```json
{"checks": [{"name": "adb", "status": "pass", "message": "ADB is installed"}, {"name": "device", "status": "pass", "message": "Device emulator-5554 connected"}, {"name": "marionette", "status": "fail", "message": "Marionette is NOT initialized", "fix": "Add MarionetteBinding.ensureInitialized() to main.dart"}], "allPass": false}
```

### Error shape (all commands)
```json
{"error": {"code": "NOT_CONNECTED", "message": "Not connected", "hint": "Run: agent-flutter connect", "diagnosticId": "a3f2b1c0"}}
```

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Assertion false (`is` command only) |
| `2` | Error (invalid args/input, not connected, timeout, command failure) |

## Error recovery playbook

| Error code | Typical cause | Recovery |
|---|---|---|
| `NOT_CONNECTED` | Missing session | Run `agent-flutter connect` |
| `ELEMENT_NOT_FOUND` | Ref stale or missing | Run `agent-flutter snapshot` and retry with new ref |
| `TIMEOUT` | Condition unmet in wait window | Increase `--timeout-ms`; verify target condition |
| `INVALID_ARGS` | Bad command shape | Run `agent-flutter <command> --help` |
| `INVALID_INPUT` | Invalid ref/text/path/device input | Fix argument format (`@eN`, safe path, valid device ID) |
| `CONNECTION_FAILED` | VM Service unreachable | Run `agent-flutter doctor` to diagnose |
| `DEVICE_NOT_FOUND` | Bad/unavailable ADB target | Check `adb devices`; set `--device` or `AGENT_FLUTTER_DEVICE` |
| `COMMAND_FAILED` | Backend/ADB/runtime failure | Read error message + `diagnosticId`; retry or isolate failing command |

## Locator strategy

When using `find`, prefer locators in this order:

| Priority | Locator | When to use | Stability |
|---|---|---|---|
| 1 | `find key <key>` | Widget has a `Key('...')` in code | Stable across builds, i18n, themes |
| 2 | `find text <label>` | Visible text label | Changes with i18n/copy updates |
| 3 | `find type <WidgetType>` | Match by widget class name | Fragile — many widgets share types |

**Rule:** Always prefer `key` when available. Fall back to `text` for buttons/labels. Use `type` only as last resort.

## Idempotency and retry safety

| Command | Idempotent | Retry safety | Notes |
|---|---|---|---|
| `connect` | Yes | Safe | Refreshes active session |
| `disconnect` | Yes | Safe | Clears session file |
| `status` | Yes | Safe | Read-only |
| `snapshot` | Yes | Safe | Refreshes refs/snapshot cache |
| `press` | No | Caution | May trigger action twice |
| `fill` | No | Caution | Repeating can duplicate text |
| `get` | Yes | Safe | Read-only |
| `find` | Depends | Depends | Safe without action; with `press/fill` use caution |
| `wait` | Yes | Safe | Polling/read-only |
| `is` | Yes | Safe | Read-only assertion |
| `scroll` | No | Caution | Directional scroll can overshoot |
| `swipe` | No | Caution | Gesture can overshoot |
| `back` | No | Caution | Can navigate too far |
| `home` | Yes | Safe | Deterministic home action |
| `screenshot` | Yes | Safe | Overwrites path if reused |
| `reload` | Mostly | Safe | Repeats hot reload request |
| `logs` | Yes | Safe | Read-only |
| `schema` | Yes | Safe | Static metadata |
| `doctor` | Yes | Safe | Read-only diagnostic |

## Recipes

### Test a login form
```bash
agent-flutter connect
agent-flutter snapshot -i
agent-flutter find type textfield press      # focus first textfield
agent-flutter fill @e2 "user@example.com"
agent-flutter find text "Password" press
agent-flutter fill @e4 "secret123"
agent-flutter find text "Sign In" press
agent-flutter wait text "Welcome" --timeout-ms 10000
agent-flutter screenshot /tmp/login-success.png
agent-flutter disconnect
```

### Verify a list renders N items
```bash
agent-flutter connect
agent-flutter snapshot --json | jq '[.[] | select(.type == "listtile")] | length'
# Assert at least 5 items
agent-flutter snapshot --json | jq '[.[] | select(.type == "listtile")] | length >= 5'
```

### Navigate and toggle a setting
```bash
agent-flutter connect
agent-flutter find text "Settings" press
agent-flutter wait text "Notifications"
agent-flutter snapshot -i
agent-flutter find type switch press         # toggle first switch
agent-flutter wait 500                       # let animation settle
agent-flutter snapshot -i                    # verify new state
agent-flutter back
```

### Screenshot-based PR evidence
```bash
agent-flutter connect
agent-flutter doctor                          # prove environment is valid
agent-flutter snapshot -i -c                  # show available elements
agent-flutter screenshot /tmp/before.png      # capture before state
# ... perform actions ...
agent-flutter screenshot /tmp/after.png       # capture after state
agent-flutter disconnect
```

## JSON-first usage

```bash
# Force JSON mode
agent-flutter --json status
agent-flutter --json snapshot

# Use env var
AGENT_FLUTTER_JSON=1 agent-flutter snapshot

# Non-TTY defaults to JSON automatically
agent-flutter snapshot | jq .

# Force human output in pipelines
agent-flutter --no-json snapshot | head
```

## Anti-flake guidance

- Run `wait` before assertions after mutating actions.
- Re-run `snapshot` after UI-changing commands (`press`, `fill`, `scroll`, `reload`).
- Prefer `--dry-run` before risky mutating commands when refs may be stale.
- Use explicit wait tuning for slow screens:
  - `--timeout-ms` to extend max wait
  - `--interval-ms` to tune polling cadence
- Prefer `find key` over `find text` for stability.
- Run `doctor` first if `connect` fails — it pinpoints the exact issue.

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `AGENT_FLUTTER_DEVICE` | ADB device ID | `emulator-5554` |
| `AGENT_FLUTTER_URI` | Default VM Service URI for `connect` | auto-detect from logcat |
| `AGENT_FLUTTER_HOME` | Session directory (`session.json`) | `~/.agent-flutter` |
| `AGENT_FLUTTER_TIMEOUT` | Default `wait` timeout ms | `10000` |
| `AGENT_FLUTTER_JSON` | JSON output mode (`1`) | unset |
| `AGENT_FLUTTER_DRY_RUN` | Dry-run mode (`1`) | unset |

Precedence: CLI flag > env var > built-in default.

## Schema discovery

```bash
agent-flutter schema          # all commands (JSON)
agent-flutter schema press    # one command
agent-flutter --help --json   # help as schema
```

## CLAUDE.md snippet

Paste this into your Flutter project's `CLAUDE.md` to make AI agents aware of agent-flutter:

```markdown
## Flutter UI Testing (agent-flutter)

This project supports agent-flutter for widget-level testing.
Prerequisites: marionette_flutter is initialized in main.dart (debug mode).

```bash
# Quick start
agent-flutter doctor           # verify setup
agent-flutter connect          # connect to running app (launched via flutter run)
agent-flutter snapshot -i      # see interactive widgets with @refs
agent-flutter press @e3        # tap by ref
agent-flutter fill @e5 "text"  # type into textfield
agent-flutter wait text "Done" # wait for UI change
agent-flutter screenshot /tmp/evidence.png
agent-flutter disconnect
```

Docs: node_modules/agent-flutter-cli/AGENTS.md
Schema: agent-flutter schema
```
