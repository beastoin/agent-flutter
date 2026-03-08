# Phase 5: Agent-Friendliness Hardening for `agent-flutter`

Build on the existing standalone CLI in `autoresearch/standalone/agent-flutter` (Phases 1–4 complete) to make it reliable for autonomous agents.

This phase is **not** about adding new interaction primitives. It is about making existing commands agent-grade:
- Discoverable
- Validatable
- Deterministic in machine mode
- Safer to automate and retry

## Before You Start

Read these files first (keep context tight):
- `src/cli.ts` — global flag parsing, dispatch, output mode, error handling
- `src/errors.ts` — structured error contract and exit behavior
- one representative handler in `src/commands/` (e.g. `press.ts`) to mirror command option patterns

Then read as needed:
- `src/session.ts` (ref resolution and persistence)
- `src/snapshot-fmt.ts` (output shaping)
- `__tests__/*.test.ts` (existing unit conventions)

## Scope

Do exactly these 8 items:

1. Schema discovery (`schema`, `schema <cmd>`, `--help --json` alias)
2. Input validation (`src/validate.ts`, applied before dispatch)
3. Environment-variable defaults and precedence
4. `AGENTS.md` for agent workflow/recovery
5. `--dry-run` for mutating commands
6. TTY-aware default output mode + explicit override
7. Contract tests (`__tests__/contract.test.ts`)
8. `diagnosticId` on every error response

No new interaction commands beyond this scope.

---

## 1) Schema Discovery (P0)

### Build
- Add `agent-flutter schema`
  - Outputs a JSON array of command schema entries.
- Add `agent-flutter schema <cmd>`
  - Outputs a JSON object for one command.
- Add alias behavior:
  - `agent-flutter --help --json` returns the same payload as `agent-flutter schema`.
- Add new file: `src/command-schema.ts`
  - Central typed definitions for all command schemas.
  - This is the source of truth for schema output and help metadata reuse.

### Required per-command schema shape
```json
{
  "name": "press",
  "description": "Tap element by ref",
  "args": [{"name":"ref","required":true,"description":"Element reference (e.g. @e3)"}],
  "flags": [],
  "exitCodes": {"0":"success","2":"error"},
  "examples": ["agent-flutter press @e3"]
}
```

### Notes
- Keep names/descriptions concise and stable.
- Include `exitCodes` on every command schema.
- Prefer deriving help text from this schema file where practical.

---

## 2) Input Validation (P0)

### Build
Create `src/validate.ts` with reusable validators:

- `validateRef`:
  - Allowed: `/^@?e\d+$/`
  - Reject everything else.
- `validateTextArg`:
  - Reject ASCII control chars `< 0x20`, except `\n` and `\t`.
- `validatePathArg`:
  - Reject traversal (`../`), `~/`, and absolute paths outside `/tmp`.
- `validateDeviceId`:
  - Allowed characters only: alphanumeric, dash, dot, colon (`^[A-Za-z0-9.:-]+$`).

### Integrate
- Apply validation in `src/cli.ts` **before command dispatch**.
- On validation failure:
  - Throw structured error code `INVALID_INPUT`.
  - Include `hint` with the rejected value/context.

---

## 3) Environment Variable Config (P0)

### Build
Support these env vars:

- `AGENT_FLUTTER_DEVICE` — default device id
- `AGENT_FLUTTER_URI` — default VM Service URI
- `AGENT_FLUTTER_HOME` — existing session dir (keep)
- `AGENT_FLUTTER_TIMEOUT` — default wait timeout
- `AGENT_FLUTTER_JSON=1` — default JSON output mode

### Precedence
Use strict order:
1. CLI flag
2. Env var
3. Built-in default

### Integration points
- `cli.ts` for global mode/defaults
- `connect` path for URI fallback
- `wait` command default timeout
- Any adb-using commands for device fallback

---

## 4) `AGENTS.md` (P0)

Create `agent-flutter/AGENTS.md` containing:

- Canonical workflow:
  - connect → snapshot → interact → assert → disconnect
- Error recovery playbook keyed by error code
- Idempotency/retry safety table per command
- JSON-first usage examples
- Anti-flake guidance:
  - wait before assert
  - re-snapshot after mutating actions
- Env var reference table
- Exit code reference (`0`, `1`, `2`)

Keep it practical and short enough for agents to scan quickly.

---

## 5) `--dry-run` on Mutating Commands (P1)

### Add flag
`--dry-run` on:
- `press`
- `fill`
- `scroll`
- `swipe`
- `back`
- `home`

### Semantics
- Resolve target/dependencies (ref lookup, device checks as applicable).
- Do **not** execute side effects.
- Output JSON describing intended action, e.g.:
```json
{"dryRun":true,"command":"press","target":"@e3","resolved":{"type":"button","key":"submit_btn","method":"Key"}}
```

---

## 6) TTY-Aware Output (P1)

### Build
- If stdout is **not TTY** and neither `--json` nor `--no-json` explicitly set:
  - auto-enable JSON mode.
- If stdout **is TTY**:
  - keep human-readable default.
- Explicit overrides:
  - `--json` forces JSON
  - `--no-json` forces human

Implement in `src/cli.ts` using `process.stdout.isTTY`.

---

## 7) Contract Tests (P1)

Add `__tests__/contract.test.ts` with unit-level contract checks (no VM required):

- `--json` success shape per command family
- Error shape:
  - `{ error: { code, message, diagnosticId, ... } }`
- Exit code contract:
  - `0` success
  - `1` assertion false
  - `2` error
- Schema output structure checks:
  - `schema`
  - `schema <cmd>`
  - alias `--help --json`

---

## 8) `diagnosticId` in Errors (P1)

### Build
- Generate unique short diagnostic id for every error response
  - e.g. `randomUUID().slice(0, 8)`
- Include it in:
  - human output: `Error [NOT_CONNECTED:a3f2b1c0]: ...`
  - JSON output: `error.diagnosticId`

### Rules
- Preserve existing `code`/`message`/`hint` behavior.
- Do not break exit code contract.

---

## Architecture Guidance

### New files
- `src/command-schema.ts`
- `src/validate.ts`
- `AGENTS.md`
- `__tests__/contract.test.ts`

### Files to modify
- `src/cli.ts` (schema dispatch, validation integration, env precedence, tty/json mode, diagnosticId wiring)
- `src/errors.ts` (add `INVALID_INPUT`, diagnosticId support)
- relevant mutating handlers:
  - `src/commands/press.ts`
  - `src/commands/fill.ts`
  - `src/commands/scroll.ts`
  - `src/commands/swipe.ts`
  - `src/commands/back.ts`
  - `src/commands/home.ts`
- `src/commands/wait.ts` (timeout default via env)
- `src/commands/connect.ts` (URI/device defaults via env)

---

## Acceptance Criteria (Must Be Testable)

1. `agent-flutter schema` returns valid JSON array.
2. Schema array includes all command names.
3. `agent-flutter schema press` returns valid JSON object.
4. Single-command schema has `name/description/args/flags/exitCodes`.
5. `agent-flutter --help --json` matches `schema`.
6. `src/command-schema.ts` exists and is used by CLI.
7. `src/validate.ts` exists.
8. Invalid ref (e.g. `@abc`) fails with `INVALID_INPUT`.
9. Invalid text with control char fails with `INVALID_INPUT`.
10. Path traversal path fails with `INVALID_INPUT`.
11. Invalid device id fails with `INVALID_INPUT`.
12. Validation happens before handler side effects.
13. `AGENT_FLUTTER_DEVICE` is honored when flag not provided.
14. `AGENT_FLUTTER_URI` is honored for connect default.
15. `AGENT_FLUTTER_TIMEOUT` sets wait default timeout.
16. `AGENT_FLUTTER_JSON=1` enables JSON mode by default.
17. CLI flag overrides env (`--no-json` beats env json).
18. `AGENTS.md` exists in CLI root.
19. `AGENTS.md` contains canonical workflow section.
20. `AGENTS.md` includes error recovery by code.
21. `AGENTS.md` includes idempotency/retry notes.
22. `AGENTS.md` includes env var reference.
23. `AGENTS.md` includes exit code reference.
24. `press --dry-run` resolves target and performs no action.
25. `fill --dry-run` resolves target and performs no action.
26. `scroll/swipe/back/home --dry-run` accepted and no side effects.
27. Non-TTY default output is JSON when mode not explicit.
28. TTY default remains human-readable.
29. `--json` and `--no-json` explicit overrides work.
30. Every error response includes `diagnosticId`.
31. Human error format includes code + diagnosticId.
32. JSON error format includes `error.code` + `error.message` + `error.diagnosticId`.
33. `__tests__/contract.test.ts` exists.
34. Contract tests pass.
35. Existing tests remain passing.
36. `npx tsc --noEmit` passes.

---

## Build Loop Protocol

For each loop:
1. Implement one scoped change (schema, validation, env, dry-run, tty, diagnostics, docs, tests).
2. Run `npx tsc --noEmit`.
3. Run `node --test __tests__/*.test.ts`.
4. Run targeted CLI spot checks:
   - `node --experimental-strip-types src/cli.ts schema`
   - `node --experimental-strip-types src/cli.ts schema press`
   - `AGENT_FLUTTER_JSON=1 node --experimental-strip-types src/cli.ts status`
5. Commit only when green.
6. Move to next item.

Do not batch all changes before first verification.

---

## Rules

- **Never stop early**: finish all acceptance criteria.
- **Existing tests are sacred**: do not weaken or delete passing tests.
- **No speculative abstractions**: keep minimal surgical edits.
- **Single source of truth**:
  - command metadata in `src/command-schema.ts`
  - validation in `src/validate.ts`
- **No regressions in exit contract** (`0/1/2`).
- **No regressions in structured errors**.
- **No behavior drift in existing commands beyond Phase 5 spec**.

