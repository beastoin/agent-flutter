# autoresearch: agent-flutter — Standalone Flutter CLI for AI Agents

Build a standalone CLI tool called `agent-flutter` that controls Flutter apps
via Marionette, with the same UX patterns as agent-device and agent-browser.

## Learning Phase: Study the CLI Patterns

Before building, you MUST study these CLI patterns deeply. Read these files:

### agent-device patterns (~/agent-device/):
- `README.md` — full command index, quick start, ref system
- `src/cli.ts` — CLI argument parsing, command dispatch
- `src/utils/snapshot-lines.ts` — snapshot output formatting (@ref [type] "label")
- `src/utils/output.ts` — formatSnapshotText, JSON vs human output
- `src/daemon/handlers/snapshot.ts` — snapshot capture + ref assignment
- `src/daemon/handlers/interaction.ts` — press/fill routing by ref
- `src/daemon/handlers/find.ts` — find command with chained actions
- `src/core/dispatch.ts` — command dispatch + flags

### agent-browser patterns (vercel-labs/agent-browser):
Study the README for CLI syntax. Key patterns:
- `snapshot` → accessibility tree with @refs (same as agent-device)
- `click @e2` / `press @e2` → tap by ref
- `fill @e3 "text"` → clear and fill by ref
- `get text @e1` / `get value @e1` → read element state
- `find role button click --name "Submit"` → semantic find + action
- `wait --text "Welcome"` → wait for text to appear
- `screenshot [path]` → capture screenshot
- `eval <js>` → run JavaScript

### Key UX principles from both CLIs:
1. **Ref system**: `snapshot` assigns sequential @e1, @e2... refs. All commands use refs.
2. **Consistent verbs**: `open`, `snapshot`, `press`/`click`, `fill`, `type`, `get`, `find`, `screenshot`, `wait`, `close`
3. **Human-readable snapshot**: indented tree with `@e1 [button] "Submit"` format
4. **JSON output**: `--json` flag for machine-readable output
5. **Session persistence**: state maintained between commands (refs, connection)
6. **Chained find**: `find key "submit_btn" press` — find + action in one command
7. **Diff snapshots**: `diff snapshot` shows what changed since last snapshot

## Build Phase: Create agent-flutter CLI

### Target CLI API

```bash
# Connection
agent-flutter connect [uri]              # Connect to Flutter VM Service (auto-detect from logcat if no URI)
agent-flutter disconnect                 # Disconnect
agent-flutter status                     # Show connection state, isolate, Marionette version

# Inspection
agent-flutter snapshot                   # Widget tree with @refs (flutter elements)
agent-flutter snapshot --json            # JSON output
agent-flutter diff snapshot              # Show changes since last snapshot
agent-flutter get text @e1               # Get element text/label
agent-flutter get type @e1               # Get Flutter widget type
agent-flutter get key @e1                # Get ValueKey if present
agent-flutter get attrs @e1              # Get all element attributes

# Interaction
agent-flutter press @e3                  # Tap element by ref
agent-flutter fill @e5 "hello"           # Enter text by ref
agent-flutter scroll @e2 down            # Scroll element

# Find (semantic locators with chained action)
agent-flutter find key "submit_btn" press              # Find by ValueKey + tap
agent-flutter find text "Submit" press                 # Find by text + tap
agent-flutter find type "TextField" fill "hello"       # Find by widget type + fill
agent-flutter find key "name_field" get text            # Find + read

# Screenshots
agent-flutter screenshot [path]          # Take screenshot via Marionette

# Hot reload
agent-flutter reload                     # Hot reload the Flutter app

# Logs
agent-flutter logs                       # Get Flutter app logs
```

### Snapshot Output Format (match agent-device style)

```
@e1 [text] "Status: Ready"
@e2 [text] "Counter: 0"
@e3 [button] "Increment"            key=increment_btn
@e4 [textfield] "Name"              key=name_field
@e5 [text] "Name: "
@e6 [switch] "Enable feature"       key=toggle_switch
@e7 [button] "Submit"               key=submit_btn
@e8 [button] "Reset"                key=reset_btn
```

Notes:
- Refs are sequential @e1, @e2, ...
- Format: `@ref [type] "label"` with optional `key=...` suffix
- Types are lowercase: button, text, textfield, switch, checkbox, slider
- Indentation for nested structures
- Interactive elements get refs; decorative elements can be omitted with `-i` flag

### Architecture

```
agent-flutter/
├── bin/agent-flutter.mjs            # Entry point
├── src/
│   ├── cli.ts                       # CLI parser (process.argv → command dispatch)
│   ├── session.ts                   # Persistent state (connection, refs, last snapshot)
│   ├── vm-client.ts                 # VmServiceClient (copy from jin's working code)
│   ├── commands/
│   │   ├── connect.ts               # connect [uri] — auto-detect from logcat
│   │   ├── disconnect.ts
│   │   ├── status.ts
│   │   ├── snapshot.ts              # snapshot [--json] [-i]
│   │   ├── press.ts                 # press @ref / press x y
│   │   ├── fill.ts                  # fill @ref "text"
│   │   ├── scroll.ts                # scroll @ref direction
│   │   ├── find.ts                  # find <locator> <value> <action> [arg]
│   │   ├── get.ts                   # get text|type|key|attrs @ref
│   │   ├── screenshot.ts
│   │   ├── reload.ts                # hot reload
│   │   └── logs.ts
│   ├── snapshot-fmt.ts              # Format elements → "@e1 [type] label" lines
│   ├── ref-store.ts                 # Map @e1 → FlutterElement, persists in session
│   └── auto-detect.ts              # Parse adb logcat for VM Service URI
├── package.json
├── tsconfig.json
└── __tests__/
    ├── cli.test.ts
    ├── snapshot-fmt.test.ts
    ├── ref-store.test.ts
    └── auto-detect.test.ts
```

### Session Persistence

Between commands, state is stored in `~/.agent-flutter/session.json`:
```json
{
  "vmServiceUri": "ws://127.0.0.1:42003/LhyO56VuSHI=/ws",
  "isolateId": "isolates/1636976439098643",
  "lastSnapshot": [...],
  "refs": {"e1": {...}, "e2": {...}},
  "connectedAt": "2026-03-08T..."
}
```

Each command reads session, operates, writes back. No daemon needed for v1.

## The Build Loop

### Phase 1: Core CLI + Connect + Snapshot
Create the CLI entry point, session management, connect (with auto-detect from logcat),
and snapshot with ref-formatted output.

**Acceptance criteria:**
1. `agent-flutter connect` auto-detects VM URI from `adb logcat`
2. `agent-flutter snapshot` outputs formatted refs: `@e1 [button] "Increment"`
3. `agent-flutter snapshot --json` outputs JSON array
4. `agent-flutter status` shows connection info
5. `agent-flutter disconnect` closes cleanly
6. Session persists between commands
7. All tests pass

### Phase 2: Interaction Commands
Add press, fill, scroll, get, find (with chained actions).

**Acceptance criteria:**
1. `agent-flutter press @e3` taps element by ref
2. `agent-flutter fill @e5 "hello"` enters text by ref
3. `agent-flutter get text @e1` returns element text
4. `agent-flutter find key "increment_btn" press` works
5. `agent-flutter find text "Submit" press` works
6. All e2e tests pass against Flutter test app on emulator

### Phase 3: Polish + Extras
Add screenshot, reload, logs, diff snapshot, error handling, help text.

**Acceptance criteria:**
1. `agent-flutter screenshot` saves PNG
2. `agent-flutter reload` triggers hot reload
3. `agent-flutter diff snapshot` shows changes
4. `agent-flutter --help` shows command list
5. Error messages are clear and actionable
6. All tests pass

## Eval

Each iteration:
1. Implement one command/feature
2. `git add -A && git commit -m "feat: <description>"`
3. Run: `pnpm build && pnpm run typecheck && pnpm test:unit`
4. E2E test: connect to running Flutter app, run commands, verify output
5. Log to `autoresearch/results.tsv`
6. Keep if pass, revert if regress

## Rules

- **NEVER STOP**: Loop until all 3 phases complete or manually interrupted.
- **Match the UX**: The snapshot output, ref system, and command syntax MUST feel
  like agent-device / agent-browser. Study their code. Copy their patterns.
- **Copy your working vm-client.ts**: Start from your proven e2e-validated code.
- **Session file, not daemon**: v1 uses file-based session (simpler than agent-device's daemon).
- **Auto-detect URI**: `agent-flutter connect` with no args should parse `adb logcat` for the VM Service URI. This is the killer UX feature.
- **Simplicity**: Keep it minimal. No extra features beyond what's listed.
- **Test against real app**: The Marionette test app is already installed on emulator-5554.
