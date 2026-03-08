# agent-flutter — Agent Workflow Guide

## Canonical workflow

```bash
# 1) Connect
agent-flutter connect
# or: agent-flutter connect ws://127.0.0.1:38047/abc=/ws

# 2) Snapshot
agent-flutter snapshot --json

# 3) Interact
agent-flutter press @e3
agent-flutter fill @e5 "hello world"
agent-flutter scroll down

# 4) Synchronize
agent-flutter wait text "Welcome" --timeout-ms 5000

# 5) Assert
agent-flutter is exists @e3   # exit 0=true, 1=false

# 6) Disconnect
agent-flutter disconnect
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
| `CONNECTION_FAILED` | VM Service unreachable | Ensure Flutter app is running; reconnect with explicit URI |
| `DEVICE_NOT_FOUND` | Bad/unavailable ADB target | Check `adb devices`; set `--device` or `AGENT_FLUTTER_DEVICE` |
| `COMMAND_FAILED` | Backend/ADB/runtime failure | Read error message + `diagnosticId`; retry or isolate failing command |

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
- Prefer stable locators (`key`) when using `find`.

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `AGENT_FLUTTER_DEVICE` | ADB device ID | `emulator-5554` |
| `AGENT_FLUTTER_URI` | Default VM Service URI for `connect` | auto-detect from logcat |
| `AGENT_FLUTTER_HOME` | Session directory (`session.json`) | `~/.agent-flutter` |
| `AGENT_FLUTTER_TIMEOUT` | Default `wait` timeout ms | `10000` |
| `AGENT_FLUTTER_JSON` | JSON output mode (`1`) | unset |
| `AGENT_FLUTTER_DRY_RUN` | Dry-run mode (`1`) | unset |

Precedence:

- Device: CLI `--device/--serial` > `AGENT_FLUTTER_DEVICE` > built-in default
- JSON: `--no-json` > `--json` > `AGENT_FLUTTER_JSON` > non-TTY auto JSON
- Wait timeout: `wait --timeout-ms` > `AGENT_FLUTTER_TIMEOUT` > `10000`

## Schema discovery

```bash
# All commands (JSON)
agent-flutter schema

# One command
agent-flutter schema press

# Help as schema
agent-flutter --help --json
```

Use schema output as source-of-truth for agent planning, argument validation, and tool selection.

# agent-flutter — Agent Workflow Guide

## Canonical workflow

```bash
# 1) Connect
agent-flutter connect
# or: agent-flutter connect ws://127.0.0.1:38047/abc=/ws

# 2) Snapshot
agent-flutter snapshot --json

# 3) Interact
agent-flutter press @e3
agent-flutter fill @e5 "hello world"
agent-flutter scroll down

# 4) Synchronize
agent-flutter wait text "Welcome" --timeout-ms 5000

# 5) Assert
agent-flutter is exists @e3   # exit 0=true, 1=false

# 6) Disconnect
agent-flutter disconnect
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
| `CONNECTION_FAILED` | VM Service unreachable | Ensure Flutter app is running; reconnect with explicit URI |
| `DEVICE_NOT_FOUND` | Bad/unavailable ADB target | Check `adb devices`; set `--device` or `AGENT_FLUTTER_DEVICE` |
| `COMMAND_FAILED` | Backend/ADB/runtime failure | Read error message + `diagnosticId`; retry or isolate failing command |

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
- Prefer stable locators (`key`) when using `find`.

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `AGENT_FLUTTER_DEVICE` | ADB device ID | `emulator-5554` |
| `AGENT_FLUTTER_URI` | Default VM Service URI for `connect` | auto-detect from logcat |
| `AGENT_FLUTTER_HOME` | Session directory (`session.json`) | `~/.agent-flutter` |
| `AGENT_FLUTTER_TIMEOUT` | Default `wait` timeout ms | `10000` |
| `AGENT_FLUTTER_JSON` | JSON output mode (`1`) | unset |
| `AGENT_FLUTTER_DRY_RUN` | Dry-run mode (`1`) | unset |

Precedence:

- Device: CLI `--device/--serial` > `AGENT_FLUTTER_DEVICE` > built-in default
- JSON: `--no-json` > `--json` > `AGENT_FLUTTER_JSON` > non-TTY auto JSON
- Wait timeout: `wait --timeout-ms` > `AGENT_FLUTTER_TIMEOUT` > `10000`

## Schema discovery

```bash
# All commands (JSON)
agent-flutter schema

# One command
agent-flutter schema press

# Help as schema
agent-flutter --help --json
```

Use schema output as source-of-truth for agent planning, argument validation, and tool selection.

