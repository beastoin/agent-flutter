# agent-flutter

[![npm](https://img.shields.io/npm/v/agent-flutter-cli)](https://www.npmjs.com/package/agent-flutter-cli)

CLI for AI agents to control Flutter apps via Dart VM Service + Marionette. Same `@ref` + snapshot workflow as `agent-device` and `agent-browser`.

## Prerequisites

### Your Flutter app needs Marionette

Add [`marionette_flutter`](https://pub.dev/packages/marionette_flutter) to your Flutter app:

```yaml
# pubspec.yaml
dev_dependencies:
  marionette_flutter: ^0.3.0
```

Initialize in your app's `main.dart` (debug mode only):

```dart
import 'package:marionette_flutter/marionette_flutter.dart';

void main() {
  assert(() {
    MarionetteBinding.ensureInitialized();
    return true;
  }());
  runApp(const MyApp());
}
```

### Runtime requirements

- **Node.js 18+**
- **ADB** accessible (`adb devices` shows your target)
- Flutter app running via `flutter run` (debug or profile mode — exposes Dart VM Service)

> **Note:** `adb install` of a pre-built APK won't work — the Dart VM Service is only exposed when launched via `flutter run`.

## Quick start

```bash
# Install
npm install -g agent-flutter-cli

# Verify prerequisites
agent-flutter doctor

# Connect to running Flutter app (auto-detects VM Service URI from logcat)
agent-flutter connect

# See all widgets with refs
agent-flutter snapshot -i

# Interact
agent-flutter press @e3
agent-flutter fill @e5 "hello world"

# Disconnect
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
| `snapshot [-i] [-c] [-d N] [--diff]` | Capture widget snapshot with refs | `agent-flutter snapshot -i` |
| `press <ref> \| <x> <y>` | Tap by ref, coordinates, or ref via ADB (`--adb`) | `agent-flutter press @e3` |
| `fill <ref> <text>` | Enter text by ref | `agent-flutter fill @e5 "hello"` |
| `get <property> <ref>` | Read `text`, `type`, `key`, or `attrs` | `agent-flutter get attrs @e3` |
| `find <locator> <value> [action] [arg]` | Find by `key`, `text`, or `type` | `agent-flutter find text "Submit" press` |
| `wait <condition> [target]` | Wait for `exists`, `visible`, `text`, `gone`, or delay ms | `agent-flutter wait text "Welcome"` |
| `is <condition> <ref>` | Assert `exists` or `visible` | `agent-flutter is exists @e3` |
| `scroll <target>` | Scroll to ref or direction | `agent-flutter scroll down` |
| `swipe <direction>` | ADB swipe gesture | `agent-flutter swipe left` |
| `back` | Android back button (ADB) | `agent-flutter back` |
| `home` | Android home button (ADB) | `agent-flutter home` |
| `screenshot [path]` | Capture screenshot | `agent-flutter screenshot /tmp/screen.png` |
| `reload` | Trigger Flutter hot reload | `agent-flutter reload` |
| `logs` | Get Flutter app logs | `agent-flutter logs` |
| `schema [command]` | Output command schema (JSON) | `agent-flutter schema press` |
| `doctor` | Check prerequisites and diagnose issues | `agent-flutter doctor` |

### Global flags

| Flag | Description |
|---|---|
| `--device <id>` | ADB device ID (default: `emulator-5554`) |
| `--json` | Force JSON output |
| `--no-json` | Force human-readable output |
| `--dry-run` | Resolve target without executing |
| `--help` | Show help (`--help --json` returns schema) |

## Snapshot format

```text
@e1 [button] "Submit"  key=submit_btn
@e2 [textfield] "Email"  key=email_input
@e3 [label] "Welcome back"
```

- Refs are sequential per snapshot (`@e1`, `@e2`, ...) and reset on each `snapshot` call.
- Re-run `snapshot` after UI-changing commands (`press`, `fill`, `scroll`, `reload`) — refs may shift.
- `snapshot --json` returns objects with `ref`, `type`, `label`, `key`, `visible`, `bounds`.

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `AGENT_FLUTTER_DEVICE` | ADB device ID | `emulator-5554` |
| `AGENT_FLUTTER_URI` | VM Service URI for `connect` | auto-detect from logcat |
| `AGENT_FLUTTER_TIMEOUT` | Default `wait` timeout (ms) | `10000` |
| `AGENT_FLUTTER_JSON` | JSON output mode (`1`) | unset |

Precedence: CLI flag > env var > built-in default.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Assertion false (`is` command only) |
| `2` | Error |

## Development

This repo is the **publish target**. Source of truth is [`beastoin/autoloop`](https://github.com/beastoin/autoloop) — all code changes go through autoloop's phase-gated build loop (program → implement → eval → keep/revert), then get copied here for npm publish.

Do not edit this repo directly. To make changes, add a new phase program in autoloop.

```bash
# For local testing only
git clone https://github.com/beastoin/agent-flutter.git
cd agent-flutter
npm install

# Typecheck
npm run typecheck

# Unit tests
npm run test:unit

# Build (bundle TypeScript to dist/)
npm run build

# Run locally
node dist/cli.mjs --help
```

## Related tools

| Tool | Platform | Transport |
|---|---|---|
| `agent-flutter` | Flutter apps | Dart VM Service + Marionette |
| [`autoloop`](https://github.com/beastoin/autoloop) | Native mobile (Android/iOS) + autoloop build system | daemon + platform runners |
| `agent-browser` | Web apps | browser automation |

All three share the same `snapshot → @ref → press/fill/wait/is` workflow.

## License

MIT
