# CLAUDE.md — Working on agent-flutter

## Publish rule

This repo is the **publish target** only. Source of truth is [`beastoin/autoloop`](https://github.com/beastoin/autoloop).
All code changes must go through autoloop's phase-gated build loop first, then get copied here for npm publish.
Do not edit this repo directly — add a new phase program in autoloop instead.

## Project overview

`agent-flutter` is a standalone Node.js CLI that controls Flutter apps through Dart VM Service + Marionette extensions.
Primary UX contract:

- snapshot-driven interaction
- `@ref` element addressing (`@e1`, `@e2`, ...)
- machine-readable JSON mode
- stable exit/error contract for agent automation

## Architecture

- `src/cli.ts`: global flags, JSON/device resolution, validation, dispatch, process exits
- `src/command-schema.ts`: canonical command metadata for `schema` and JSON help
- `src/commands/*.ts`: one command per module (connect/snapshot/press/fill/etc.)
- `src/vm-client.ts`: WebSocket JSON-RPC client + Marionette RPC wrappers
- `src/session.ts`: file-backed session (`$AGENT_FLUTTER_HOME/session.json`)
- `src/snapshot-fmt.ts`: ref assignment + line/json snapshot formatting
- `src/auto-detect.ts`: adb logcat VM URI detection + adb forward
- `src/errors.ts`: typed error codes + `diagnosticId` formatting
- `src/validate.ts`: pre-dispatch input validation

## Run tests

```bash
# Typecheck
pnpm typecheck

# Unit + contract tests
pnpm test:unit

# Focused test file
node --experimental-strip-types --test __tests__/contract.test.ts
```

## Code conventions

- TypeScript ESM modules (`.ts` imports with explicit extension).
- Node built-ins only; no external runtime dependencies.
- Keep command logic in `src/commands/<name>.ts`.
- Each command should support `--help` consistently.
- Throw `AgentFlutterError` with `ErrorCodes` for user-facing failures.
- Keep output deterministic and automation-friendly (especially in JSON mode).
- Preserve existing precedence rules:
  - JSON: `--no-json` > `--json` > env > TTY default
  - device: CLI > env > default
- Keep exit codes stable (`0`, `1` for false `is`, `2` for errors).

## Key patterns to preserve

### Session model

- Session file stores `vmServiceUri`, `isolateId`, `refs`, `lastSnapshot`, `connectedAt`.
- Commands requiring live app state must fail with `NOT_CONNECTED` if session missing.

### Ref model

- Refs are assigned sequentially from snapshot order (`e1`, `e2`, ...).
- Ref resolution accepts both `@eN` and `eN`.
- Mutating commands should rely on session refs from recent snapshots.

### Matcher + wire protocol

- Use matcher serialization from `vm-client.ts`:
  - key => `{ key: ... }`
  - text => `{ text: ... }`
  - coordinates => `{ x: "..." , y: "..." }` (strings)
- `enterText` must send `input` field (not `text`).
- Marionette RPC namespace must remain `ext.flutter.marionette.*`.

### Errors

- Prefer `AgentFlutterError(code, message, hint?)`.
- Maintain structured JSON envelope from `formatError`.
- Keep `diagnosticId` in every error response.

## Common tasks

### Add a new command

1. Create `src/commands/<command>.ts`.
2. Add dispatch in `src/cli.ts` switch.
3. Add schema entry in `src/command-schema.ts` (args, flags, exit codes, examples).
4. Add/update tests in `__tests__` (behavior + contract as needed).
5. Ensure help text, JSON mode, and errors follow existing patterns.

### Add or update tests

- Place tests under `__tests__/*.test.ts`.
- Prefer focused unit tests for parsing, validation, and command behavior.
- Add contract assertions when changing schema/error/output shapes.

### Modify snapshot format

1. Update `src/snapshot-fmt.ts`.
2. Keep both human line format and JSON format coherent.
3. Preserve ref stability assumptions (sequential assignment).
4. Update snapshot-related tests (`snapshot-fmt`, `snapshot-filter`, contract if needed).

## What not to do

- Do not change exit code semantics (`is` false must remain exit `1`).
- Do not change command schema shape without updating contract tests and callers.
- Do not change Marionette method names or parameter field names casually.
- Do not break JSON error envelope (`error.code/message/hint?/diagnosticId`).
- Do not add external dependencies for simple logic.
- Do not bypass validation for ref/text/path/device input.
- Do not silently alter env/flag precedence.

## Practical implementation checklist

- Command behavior updated
- `schema` metadata updated
- Help text updated
- Validation paths covered
- Unit/contract tests updated
- `pnpm typecheck` and `pnpm test:unit` pass
