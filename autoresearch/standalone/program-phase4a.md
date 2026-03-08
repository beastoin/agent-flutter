# Phase 4a: Autonomy-Grade agent-flutter

Build on the existing agent-flutter CLI (Phases 1-3 complete, 1027 lines) to add
the commands and behaviors required for LLM agents to autonomously test Flutter apps.

## Before You Start

Read these files to understand what already exists:
- `src/cli.ts` — current command dispatch (11 commands)
- `src/vm-client.ts` — VmServiceClient with tap/enterText/scrollTo/hotReload/takeScreenshot
- `src/session.ts` — session persistence (load/save/resolveRef)
- `src/snapshot-fmt.ts` — @ref [type] "label" formatting
- `src/auto-detect.ts` — ADB logcat parsing + port forwarding
- `src/commands/*.ts` — all existing command handlers

## What to Build

### 1. `wait` Command (highest priority)
AI agents MUST synchronize with async UI. Without `wait`, agents retry blindly.

```bash
agent-flutter wait exists @e3 [--timeout-ms 10000] [--interval-ms 250]
agent-flutter wait visible @e3 [--timeout-ms 10000] [--interval-ms 250]
agent-flutter wait text "Welcome" [--timeout-ms 10000] [--interval-ms 250]
agent-flutter wait gone @e3 [--timeout-ms 10000] [--interval-ms 250]
agent-flutter wait <ms>              # Simple delay (e.g., wait 1000)
```

Implementation:
- Create `src/commands/wait.ts`
- For `exists`/`visible`: poll `getInteractiveElements()` every `interval-ms`, check if ref/element exists
- For `text`: poll snapshot, check if any element contains the text
- For `gone`: poll snapshot, check that ref/element is no longer present
- For `<ms>`: simple setTimeout
- On success: exit 0, print what was found
- On timeout: exit 2, print `TIMEOUT: <condition> not met within <ms>ms`
- Default timeout: 10000ms, default interval: 250ms

### 2. `is` Command (assertions)
Test scripts need assertions with machine-readable exit codes.

```bash
agent-flutter is exists @e3          # Exit 0 if exists, exit 1 if not
agent-flutter is visible @e3         # Exit 0 if visible, exit 1 if not
```

Implementation:
- Create `src/commands/is.ts`
- `exists`: check if ref exists in session refs (no VM connection needed)
- `visible`: check ref exists AND `visible === true`
- Exit code contract: 0=true, 1=false, 2=error
- Output: "true" or "false" (machine-parseable)
- Important: do NOT throw on false — return exit code 1 silently

### 3. `scroll` Command
The VM client already has `scrollTo()`. Wire it to the CLI.

```bash
agent-flutter scroll @e3             # Scroll element into view via Marionette
agent-flutter scroll down [amount]   # Swipe-scroll via ADB input
agent-flutter scroll up [amount]     # Swipe-scroll via ADB input
```

Implementation:
- Create `src/commands/scroll.ts`
- If arg starts with `@`: use `client.scrollTo(matcher)` to scroll element into view
- If arg is `up`/`down`/`left`/`right`: use ADB `input swipe` command
  - `down`: `adb shell input swipe 540 1500 540 500 300` (swipe up to scroll down)
  - `up`: `adb shell input swipe 540 500 540 1500 300`
  - Amount (optional): multiply distance
- Use the `--device` global flag for ADB device ID

### 4. `swipe` Command
Common mobile gesture for page navigation, dismissing, etc.

```bash
agent-flutter swipe up|down|left|right [--distance 0.7] [--duration-ms 250]
```

Implementation:
- Create `src/commands/swipe.ts`
- Calculate coordinates based on screen center (540x960 default for emulator)
- `--distance`: fraction of screen to swipe (default 0.5)
- `--duration-ms`: swipe duration in ms (default 300)
- Use ADB `input swipe x1 y1 x2 y2 durationMs`

### 5. `back` and `home` Commands

```bash
agent-flutter back                   # Android back button
agent-flutter home                   # Android home button
```

Implementation:
- Create `src/commands/back.ts` and `src/commands/home.ts`
- `back`: `adb shell input keyevent KEYCODE_BACK` (keycode 4)
- `home`: `adb shell input keyevent KEYCODE_HOME` (keycode 3)
- Simple, no VM connection needed

### 6. Snapshot Flags
Match agent-device/agent-browser snapshot options.

```bash
agent-flutter snapshot [-i|--interactive] [-c|--compact] [-d|--depth N] [--json] [--diff]
```

Implementation:
- Modify `src/commands/snapshot.ts` and `src/snapshot-fmt.ts`
- `-i`/`--interactive`: filter to only interactive elements (buttons, textfields, switches, checkboxes, sliders, dropdowns — exclude labels, containers, layout widgets)
- `-c`/`--compact`: one-line format, no extra whitespace
- `-d N`/`--depth N`: limit tree depth (currently flat, so this is a no-op for now but should be accepted without error)
- All flags should work together: `snapshot -i -c --json`

Interactive filter — keep these types: button, textfield, switch, checkbox, radio, slider, dropdown, menu, gesture, tab. Exclude: label, container, column, row, stack, scaffold, appbar, card, image, icon, tile, navbar, tabbar.

### 7. `--device` Global Flag
Stop hardcoding `emulator-5554`.

```bash
agent-flutter --device emulator-5556 snapshot
agent-flutter --serial 192.168.1.100:5555 connect
```

Implementation:
- Parse `--device <id>` and `--serial <id>` in `src/cli.ts` BEFORE command dispatch
- Store in a global/env and pass to `auto-detect.ts` and all ADB commands
- Default: `emulator-5554` (backward compatible)
- Affects: connect (auto-detect), screenshot (ADB fallback), scroll (ADB), swipe, back, home

### 8. Structured Error Codes
Replace ad-hoc error messages with stable error codes.

```typescript
// src/errors.ts
export type AgentFlutterError = {
  code: string;
  message: string;
  hint?: string;
};

export const ErrorCodes = {
  INVALID_ARGS: 'INVALID_ARGS',
  NOT_CONNECTED: 'NOT_CONNECTED',
  ELEMENT_NOT_FOUND: 'ELEMENT_NOT_FOUND',
  TIMEOUT: 'TIMEOUT',
  DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  COMMAND_FAILED: 'COMMAND_FAILED',
} as const;
```

Implementation:
- Create `src/errors.ts` with error class and codes
- Update `src/cli.ts` catch block to output structured errors:
  - Human mode: `Error [NOT_CONNECTED]: Not connected. Run: agent-flutter connect`
  - JSON mode (`--json` on any command): `{"error":{"code":"NOT_CONNECTED","message":"...","hint":"..."}}`
- Update existing command throw sites to use the new error class

### 9. Per-Command `--help`
LLM agents read help text for self-repair when commands fail.

```bash
agent-flutter press --help
# → Usage: agent-flutter press @ref
# →   Tap element by ref.
# →   @ref  Element reference from snapshot (e.g. @e3)
```

Implementation:
- Each command checks for `--help` or `-h` in args
- Print usage string and return (don't execute)
- Keep it short: 2-4 lines per command

### 10. Exit Code Contract
Standardize exit codes across ALL commands.

- `0` — success
- `1` — assertion false (`is` commands only)
- `2` — error (connection failed, element not found, timeout, invalid args)

Implementation:
- Update `src/cli.ts` main catch to use `process.exit(2)` instead of `process.exit(1)`
- `is` command returns exit 1 for false assertions
- All other errors use exit 2

### 11. Global `--json` Flag
Ensure `--json` works on ALL commands, not just snapshot.

Implementation:
- Parse `--json` in `src/cli.ts` alongside `--device`
- Pass as option to each command
- When `--json`: output `{"success":true,"data":...}` for success
- When `--json`: output `{"error":{"code":"...","message":"..."}}` for errors

## Architecture

New files to create:
```
src/commands/wait.ts        ~80 lines
src/commands/is.ts          ~40 lines
src/commands/scroll.ts      ~45 lines
src/commands/swipe.ts       ~40 lines
src/commands/back.ts        ~15 lines
src/commands/home.ts        ~15 lines
src/errors.ts               ~35 lines
```

Files to modify:
```
src/cli.ts                  Add --device, --json, --help, new commands, exit codes
src/commands/snapshot.ts    Add -i, -c, -d flags
src/snapshot-fmt.ts         Add interactive filter function
src/auto-detect.ts          Accept deviceId parameter
src/commands/screenshot.ts  Use deviceId from global flag
```

New test files:
```
__tests__/errors.test.ts    ~30 lines
__tests__/wait.test.ts      ~40 lines  (mock-based)
```

## Acceptance Criteria

1. `agent-flutter wait exists @e3` polls and succeeds when element exists
2. `agent-flutter wait text "Counter"` polls and succeeds when text appears
3. `agent-flutter wait 500` waits 500ms
4. `agent-flutter wait exists @e99 --timeout-ms 1000` exits 2 on timeout
5. `agent-flutter is exists @e3` exits 0 when element exists
6. `agent-flutter is exists @e99` exits 1 (not 2) when element missing
7. `agent-flutter scroll @e3` scrolls element into view
8. `agent-flutter scroll down` scrolls via ADB
9. `agent-flutter swipe up` swipes via ADB
10. `agent-flutter back` sends KEYCODE_BACK
11. `agent-flutter home` sends KEYCODE_HOME
12. `agent-flutter snapshot -i` shows only interactive elements (no labels)
13. `agent-flutter snapshot -i --json` returns filtered JSON
14. `agent-flutter --device emulator-5554 snapshot` works with explicit device
15. Errors output stable codes: `Error [NOT_CONNECTED]: ...`
16. `agent-flutter press --help` shows usage
17. Exit code 2 on errors, exit 1 on `is` false, exit 0 on success
18. All existing tests still pass (SACRED — do not break)
19. All new tests pass
20. TypeScript compiles clean (`npx tsc --noEmit`)

## Build Loop

Each iteration:
1. Implement one feature from the list above
2. Run: `npx tsc --noEmit` (must pass)
3. Run: `node --test __tests__/*.test.ts` (must pass, existing + new)
4. `git add -A && git commit -m "feat: <description>"`
5. If any step fails, fix before moving on — never leave broken code

## Rules

- **NEVER STOP**: Loop until ALL 20 acceptance criteria pass.
- **Existing tests are SACRED**: Never modify existing passing tests to make them pass differently.
- **Match the patterns**: Follow existing code patterns in cli.ts, commands/*.ts. Don't reinvent.
- **ADB commands**: Always use the device ID from the --device global flag, never hardcode.
- **Simple implementations first**: Get it working, then polish. Don't over-engineer.
- **Exit codes matter**: AI agents parse exit codes. 0/1/2 contract is non-negotiable.
