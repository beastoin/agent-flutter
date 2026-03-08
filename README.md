# agent-flutter

CLI for AI agents to test and develop Flutter apps through Dart VM Service + Marionette, using the same `@ref` + snapshot workflow as `agent-device` and `agent-browser`.

## At a glance

- 2103 lines of TypeScript across 25 source files
- 18 commands
- 36+ e2e tests, 43 unit tests, plus contract tests
- 5 development phases completed with 0 reverts
- Zero external dependencies (pure Node.js 22+)

## Quick start

```bash
# 1) Install dependencies
pnpm install

# 2) Optional: expose binary globally
pnpm link --global

# 3) Connect to running Flutter app (auto-detect URI from logcat)
agent-flutter connect

# 4) Take first snapshot
agent-flutter snapshot -i --json

# 5) Interact
agent-flutter press @e3
agent-flutter fill @e5 "hello world"

# 6) Disconnect
agent-flutter disconnect
```

If you already have a VM Service URI:

```bash
agent-flutter connect ws://127.0.0.1:38047/abc=/ws
```

## Command reference

| Command | Description | Example |
|---|---|---|
| `connect [uri]` | Connect to Flutter VM Service | `agent-flutter connect` |
| `disconnect` | Disconnect from Flutter app | `agent-flutter disconnect` |
| `status` | Show connection state | `agent-flutter status` |
| `snapshot [-i] [-c] [-d N] [--diff]` | Capture widget snapshot with refs | `agent-flutter snapshot --diff` |
| `press <ref>` | Tap element by ref | `agent-flutter press @e3` |
| `fill <ref> <text>` | Enter text by ref | `agent-flutter fill @e5 "hello world"` |
| `get <property> <ref>` | Read `text`, `type`, `key`, or `attrs` | `agent-flutter get attrs @e3` |
| `find <locator> <value> [action] [arg]` | Find by `key`, `text`, or `type`, optional action | `agent-flutter find key submit_btn press` |
| `wait <condition> [target]` | Wait for `exists`, `visible`, `text`, `gone`, or delay ms | `agent-flutter wait text "Welcome"` |
| `is <condition> <ref>` | Assert `exists` or `visible` | `agent-flutter is exists @e3` |
| `scroll <target>` | Scroll to ref or direction `up/down/left/right` | `agent-flutter scroll down` |
| `swipe <direction>` | ADB swipe gesture | `agent-flutter swipe left --distance 0.7` |
| `back` | Android back button (ADB) | `agent-flutter back` |
| `home` | Android home button (ADB) | `agent-flutter home` |
| `screenshot [path]` | Capture screenshot | `agent-flutter screenshot /tmp/screen.png` |
| `reload` | Trigger Flutter hot reload | `agent-flutter reload` |
| `logs` | Get Flutter app logs | `agent-flutter logs` |
| `schema [command]` | Output command schema for agents | `agent-flutter schema press` |

### Global flags

- `--device <id>`: set ADB device (alias: `--serial`)
- `--json`: force JSON output
- `--no-json`: force human output
- `--dry-run`: resolve target without executing (mutating commands)
- `--help`: show help (`--help --json` returns schema)

## Snapshot format

Each element is assigned a stable ref for the current snapshot:

```text
@e1 [button] "Submit"  key=submit_btn
@e2 [textfield] "Email"  key=email_input
@e3 [label] "Welcome back"
```

Format:

```text
@<ref> [<normalized_type>] "<label>"  key=<widget_key>
```

Notes:

- Refs are sequential per snapshot (`e1`, `e2`, `e3`, ...).
- Refs can change after UI mutations; re-run `snapshot` after `press`, `fill`, `scroll`, `reload`.
- `snapshot --json` returns machine-friendly objects with `ref`, `type`, `label`, `key`, `visible`, `bounds`, `flutterType`.

## Architecture overview

```text
agent-flutter/
├── bin/agent-flutter.mjs      # Node entry wrapper
├── src/cli.ts                 # global flag parsing, dispatch, exit/error handling
├── src/command-schema.ts      # canonical command metadata
├── src/vm-client.ts           # JSON-RPC client for Dart VM Service + Marionette RPCs
├── src/session.ts             # ~/.agent-flutter/session.json persistence
├── src/snapshot-fmt.ts        # ref assignment + text/json snapshot formatting
├── src/auto-detect.ts         # adb logcat URI detect + adb forward
├── src/errors.ts              # structured error codes + diagnosticId formatting
├── src/validate.ts            # input validation before dispatch
├── src/commands/*.ts          # one module per command
└── __tests__/*.test.ts        # unit + contract tests
```

## Requirements

- Node.js 22+
- Flutter app running in debug/profile with Marionette enabled (`MarionetteBinding.ensureInitialized()`)
- Android emulator/device accessible via `adb`
- VM Service reachable (auto-detected or passed to `connect`)
- `marionette_flutter` integrated in the target app

## Comparison: agent-flutter vs companion tools

| Tool | Platform | Transport | Core UX |
|---|---|---|---|
| `agent-flutter` | Flutter apps | Dart VM Service + Marionette RPCs | `snapshot`, `@ref`, `press/fill/find/wait/is`, structured JSON errors |
| `agent-device` | Native mobile (Android/iOS) | daemon + platform runners | same agent interaction model |
| `agent-browser` | Web apps | browser automation transport | same agent interaction model |

All three intentionally share the same automation shape so agents can switch targets with minimal prompt changes.

## Development and contributing

```bash
# Typecheck
pnpm typecheck

# Unit + contract tests
pnpm test:unit

# Run directly without global link
node --experimental-strip-types src/cli.ts --help
```

Guidelines:

- Keep command behavior and schema in sync (`src/command-schema.ts`).
- Preserve exit code contract (`0` success, `1` only for `is=false`, `2` errors).
- Keep wire protocol compatibility (`ext.flutter.marionette.*`, matcher serialization, `enterText` uses `input` field).
- Keep dependency policy: no external runtime dependencies.

## License

Apache-2.0 (see `LICENSE`).

# agent-flutter

CLI for AI agents to test and develop Flutter apps through Dart VM Service + Marionette, using the same `@ref` + snapshot workflow as `agent-device` and `agent-browser`.

## At a glance

- 2103 lines of TypeScript across 25 source files
- 18 commands
- 36+ e2e tests, 43 unit tests, plus contract tests
- 5 development phases completed with 0 reverts
- Zero external dependencies (pure Node.js 22+)

## Quick start

```bash
# 1) Install dependencies
pnpm install

# 2) Optional: expose binary globally
pnpm link --global

# 3) Connect to running Flutter app (auto-detect URI from logcat)
agent-flutter connect

# 4) Take first snapshot
agent-flutter snapshot -i --json

# 5) Interact
agent-flutter press @e3
agent-flutter fill @e5 "hello world"

# 6) Disconnect
agent-flutter disconnect
```

If you already have a VM Service URI:

```bash
agent-flutter connect ws://127.0.0.1:38047/abc=/ws
```

## Command reference

| Command | Description | Example |
|---|---|---|
| `connect [uri]` | Connect to Flutter VM Service | `agent-flutter connect` |
| `disconnect` | Disconnect from Flutter app | `agent-flutter disconnect` |
| `status` | Show connection state | `agent-flutter status` |
| `snapshot [-i] [-c] [-d N] [--diff]` | Capture widget snapshot with refs | `agent-flutter snapshot --diff` |
| `press <ref>` | Tap element by ref | `agent-flutter press @e3` |
| `fill <ref> <text>` | Enter text by ref | `agent-flutter fill @e5 "hello world"` |
| `get <property> <ref>` | Read `text`, `type`, `key`, or `attrs` | `agent-flutter get attrs @e3` |
| `find <locator> <value> [action] [arg]` | Find by `key`, `text`, or `type`, optional action | `agent-flutter find key submit_btn press` |
| `wait <condition> [target]` | Wait for `exists`, `visible`, `text`, `gone`, or delay ms | `agent-flutter wait text "Welcome"` |
| `is <condition> <ref>` | Assert `exists` or `visible` | `agent-flutter is exists @e3` |
| `scroll <target>` | Scroll to ref or direction `up/down/left/right` | `agent-flutter scroll down` |
| `swipe <direction>` | ADB swipe gesture | `agent-flutter swipe left --distance 0.7` |
| `back` | Android back button (ADB) | `agent-flutter back` |
| `home` | Android home button (ADB) | `agent-flutter home` |
| `screenshot [path]` | Capture screenshot | `agent-flutter screenshot /tmp/screen.png` |
| `reload` | Trigger Flutter hot reload | `agent-flutter reload` |
| `logs` | Get Flutter app logs | `agent-flutter logs` |
| `schema [command]` | Output command schema for agents | `agent-flutter schema press` |

### Global flags

- `--device <id>`: set ADB device (alias: `--serial`)
- `--json`: force JSON output
- `--no-json`: force human output
- `--dry-run`: resolve target without executing (mutating commands)
- `--help`: show help (`--help --json` returns schema)

## Snapshot format

Each element is assigned a stable ref for the current snapshot:

```text
@e1 [button] "Submit"  key=submit_btn
@e2 [textfield] "Email"  key=email_input
@e3 [label] "Welcome back"
```

Format:

```text
@<ref> [<normalized_type>] "<label>"  key=<widget_key>
```

Notes:

- Refs are sequential per snapshot (`e1`, `e2`, `e3`, ...).
- Refs can change after UI mutations; re-run `snapshot` after `press`, `fill`, `scroll`, `reload`.
- `snapshot --json` returns machine-friendly objects with `ref`, `type`, `label`, `key`, `visible`, `bounds`, `flutterType`.

## Architecture overview

```text
agent-flutter/
├── bin/agent-flutter.mjs      # Node entry wrapper
├── src/cli.ts                 # global flag parsing, dispatch, exit/error handling
├── src/command-schema.ts      # canonical command metadata
├── src/vm-client.ts           # JSON-RPC client for Dart VM Service + Marionette RPCs
├── src/session.ts             # ~/.agent-flutter/session.json persistence
├── src/snapshot-fmt.ts        # ref assignment + text/json snapshot formatting
├── src/auto-detect.ts         # adb logcat URI detect + adb forward
├── src/errors.ts              # structured error codes + diagnosticId formatting
├── src/validate.ts            # input validation before dispatch
├── src/commands/*.ts          # one module per command
└── __tests__/*.test.ts        # unit + contract tests
```

## Requirements

- Node.js 22+
- Flutter app running in debug/profile with Marionette enabled (`MarionetteBinding.ensureInitialized()`)
- Android emulator/device accessible via `adb`
- VM Service reachable (auto-detected or passed to `connect`)
- `marionette_flutter` integrated in the target app

## Comparison: agent-flutter vs companion tools

| Tool | Platform | Transport | Core UX |
|---|---|---|---|
| `agent-flutter` | Flutter apps | Dart VM Service + Marionette RPCs | `snapshot`, `@ref`, `press/fill/find/wait/is`, structured JSON errors |
| `agent-device` | Native mobile (Android/iOS) | daemon + platform runners | same agent interaction model |
| `agent-browser` | Web apps | browser automation transport | same agent interaction model |

All three intentionally share the same automation shape so agents can switch targets with minimal prompt changes.

## Development and contributing

```bash
# Typecheck
pnpm typecheck

# Unit + contract tests
pnpm test:unit

# Run directly without global link
node --experimental-strip-types src/cli.ts --help
```

Guidelines:

- Keep command behavior and schema in sync (`src/command-schema.ts`).
- Preserve exit code contract (`0` success, `1` only for `is=false`, `2` errors).
- Keep wire protocol compatibility (`ext.flutter.marionette.*`, matcher serialization, `enterText` uses `input` field).
- Keep dependency policy: no external runtime dependencies.

## License

Apache-2.0 (see `LICENSE`).

