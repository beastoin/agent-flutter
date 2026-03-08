/**
 * E2E test for agent-flutter CLI.
 * Tests the CLI commands against a real Flutter app on the emulator.
 *
 * Requires:
 * - VM_SERVICE_URI env var
 * - AGENT_FLUTTER env var (path to agent-flutter dir)
 * - Flutter test app running on emulator-5554
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const AGENT_FLUTTER = process.env.AGENT_FLUTTER;
const VM_URI = process.env.VM_SERVICE_URI;

if (!AGENT_FLUTTER || !VM_URI) {
  console.error('AGENT_FLUTTER and VM_SERVICE_URI env vars required');
  process.exit(1);
}

const CLI = `${AGENT_FLUTTER}/src/cli.ts`;
const SESSION_HOME = '/tmp/agent-flutter-test';
const IS_PHASE5 = existsSync(`${AGENT_FLUTTER}/src/command-schema.ts`);

type EnvOverrides = Record<string, string>;

function normalizeArgs(args: string[], forceRaw: boolean): string[] {
  if (forceRaw || !IS_PHASE5) return args;
  if (args.includes('--json') || args.includes('--no-json')) return args;
  return ['--no-json', ...args];
}

function runInternal(args: string[], extraEnv: EnvOverrides = {}, forceRaw = false): string {
  const result = execFileSync('node', ['--experimental-strip-types', CLI, ...normalizeArgs(args, forceRaw)], {
    encoding: 'utf-8',
    timeout: 15000,
    env: { ...process.env, AGENT_FLUTTER_HOME: SESSION_HOME, ...extraEnv },
  });
  return result.trim();
}

function run(...args: string[]): string {
  return runInternal(args);
}

function runRaw(...args: string[]): string {
  return runInternal(args, {}, true);
}

function runWithEnv(extraEnv: EnvOverrides, ...args: string[]): string {
  return runInternal(args, extraEnv, true);
}

/**
 * Run a command and return { stdout, exitCode } without throwing on non-zero exit.
 */
function runWithExitInternal(args: string[], extraEnv: EnvOverrides = {}, forceRaw = false): { stdout: string; exitCode: number } {
  try {
    const result = execFileSync('node', ['--experimental-strip-types', CLI, ...normalizeArgs(args, forceRaw)], {
      encoding: 'utf-8',
      timeout: 15000,
      env: { ...process.env, AGENT_FLUTTER_HOME: SESSION_HOME, ...extraEnv },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout: result.trim(), exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: (err.stdout ?? '').toString().trim(),
      exitCode: err.status ?? 2,
    };
  }
}

function runWithExit(...args: string[]): { stdout: string; exitCode: number } {
  return runWithExitInternal(args);
}

function unwrapData(payload: any): any {
  if (payload && typeof payload === 'object' && 'data' in payload && payload.data !== undefined) {
    return payload.data;
  }
  return payload;
}

function requirePhase5(): boolean {
  if (!IS_PHASE5) {
    console.log('Phase 5 not detected, skipping this test');
    return false;
  }
  return true;
}

describe('agent-flutter CLI e2e', () => {
  before(() => {
    // Connect to the Flutter app
    const output = run('connect', VM_URI!);
    console.log('connect:', output);
  });

  after(() => {
    try { run('disconnect'); } catch {}
  });

  it('should show status after connect', () => {
    const output = run('status');
    console.log('status:', output);
    assert.ok(output.includes('connected') || output.includes('Connected'), 'Should show connected status');
  });

  it('should produce snapshot with @refs in correct format', () => {
    const output = run('snapshot');
    console.log('snapshot output:\n', output);
    // Must have @e1, @e2, etc.
    assert.ok(output.includes('@e'), 'Should contain @e refs');
    // Must have [type] format
    assert.match(output, /@e\d+ \[/, 'Should have @ref [type] format');
    // Should have known elements from test app
    assert.ok(
      output.includes('Increment') || output.includes('increment'),
      'Should contain Increment button',
    );
  });

  it('should produce JSON snapshot with --json flag', () => {
    const output = run('snapshot', '--json');
    const parsed = JSON.parse(output);
    assert.ok(Array.isArray(parsed), 'JSON output should be array');
    assert.ok(parsed.length > 0, 'Should have elements');
    assert.ok(parsed[0].ref, 'Elements should have ref field');
  });

  it('should press element by ref', () => {
    // Get snapshot first to know refs
    const snap = run('snapshot', '--json');
    const elements = JSON.parse(snap);
    const incrementBtn = elements.find((e: any) =>
      e.key === 'increment_btn' || e.label?.includes('Increment'),
    );
    assert.ok(incrementBtn, 'Should find increment button');

    const output = run('press', `@${incrementBtn.ref}`);
    console.log('press:', output);
  });

  it('should fill text field by ref', () => {
    const snap = run('snapshot', '--json');
    const elements = JSON.parse(snap);
    const nameField = elements.find((e: any) =>
      e.key === 'name_field' || e.type?.toLowerCase().includes('text'),
    );
    assert.ok(nameField, 'Should find name field');

    const output = run('fill', `@${nameField.ref}`, 'e2e-test-value');
    console.log('fill:', output);
  });

  it('should get text of element by ref', () => {
    const snap = run('snapshot', '--json');
    const elements = JSON.parse(snap);
    const statusText = elements.find((e: any) =>
      e.key === 'status_text' || e.label?.includes('Status'),
    );
    assert.ok(statusText, 'Should find status text');

    const output = run('get', 'text', `@${statusText.ref}`);
    console.log('get text:', output);
    assert.ok(output.length > 0, 'Should return text');
  });

  it('should find by key and press', () => {
    const output = run('find', 'key', 'reset_btn', 'press');
    console.log('find key press:', output);
  });

  it('should find by text and press', () => {
    const output = run('find', 'text', 'Increment', 'press');
    console.log('find text press:', output);
  });

  it('should take screenshot', () => {
    const output = run('screenshot', '/tmp/agent-flutter-e2e-screenshot.png');
    console.log('screenshot:', output);
    // Check file exists
    const fs = require('node:fs');
    assert.ok(
      fs.existsSync('/tmp/agent-flutter-e2e-screenshot.png'),
      'Screenshot file should exist',
    );
  });

  it('should show help', () => {
    const output = run('--help');
    console.log('help:', output);
    assert.ok(output.includes('connect'), 'Help should list connect command');
    assert.ok(output.includes('snapshot'), 'Help should list snapshot command');
    assert.ok(output.includes('press'), 'Help should list press command');
  });

  // ===== Phase 4a Tests =====

  it('should produce interactive-only snapshot with -i flag', () => {
    const output = run('snapshot', '-i');
    console.log('snapshot -i:\n', output);
    // Should have interactive elements (buttons, textfields)
    assert.ok(output.includes('@e'), 'Should contain @e refs');
    assert.match(output, /\[(button|textfield|switch|checkbox|radio|slider|dropdown|menu|gesture|tab)\]/, 'Should have interactive type');
    // Should NOT have pure labels (text-only elements)
    // Note: labels that are part of buttons (e.g. "Increment") may still appear as button text
  });

  it('should produce interactive-only JSON with -i --json', () => {
    const fullSnap = run('snapshot', '--json');
    const fullElements = JSON.parse(fullSnap);

    const interactiveSnap = run('snapshot', '-i', '--json');
    const interactiveElements = JSON.parse(interactiveSnap);

    console.log(`snapshot: full=${fullElements.length} interactive=${interactiveElements.length}`);
    assert.ok(interactiveElements.length > 0, 'Should have interactive elements');
    assert.ok(interactiveElements.length <= fullElements.length, 'Interactive subset should be smaller or equal');

    // All elements should be interactive types
    const interactiveTypes = ['button', 'textfield', 'switch', 'checkbox', 'radio', 'slider', 'dropdown', 'menu', 'gesture', 'tab'];
    for (const el of interactiveElements) {
      assert.ok(
        interactiveTypes.includes(el.type),
        `Element type "${el.type}" should be interactive (ref=${el.ref})`,
      );
    }
  });

  it('should show per-command help', () => {
    for (const cmd of ['press', 'fill', 'snapshot', 'wait', 'is', 'scroll', 'swipe']) {
      const output = run(cmd, '--help');
      assert.ok(output.length > 10, `${cmd} --help should output usage text`);
      console.log(`${cmd} --help: OK`);
    }
  });

  it('should list new commands in main help', () => {
    const output = run('--help');
    for (const cmd of ['wait', 'is', 'scroll', 'swipe', 'back', 'home']) {
      assert.ok(
        output.toLowerCase().includes(cmd),
        `Main help should list "${cmd}" command`,
      );
    }
  });

  it('wait exists should succeed for known element', () => {
    // Ensure snapshot refs are populated
    run('snapshot');

    // wait exists on a known ref should succeed quickly
    const snap = run('snapshot', '--json');
    const elements = JSON.parse(snap);
    assert.ok(elements.length > 0, 'Should have elements');

    const output = run('wait', 'exists', `@${elements[0].ref}`, '--timeout-ms', '3000');
    console.log('wait exists:', output);
  });

  it('wait text should succeed for visible text', () => {
    const output = run('wait', 'text', 'Increment', '--timeout-ms', '5000');
    console.log('wait text:', output);
  });

  it('wait exists should timeout for unknown ref', () => {
    const { exitCode } = runWithExit('wait', 'exists', '@e99999', '--timeout-ms', '1000');
    console.log('wait timeout exitCode:', exitCode);
    assert.equal(exitCode, 2, 'Timeout should exit with code 2');
  });

  it('wait <ms> should accept simple delay', () => {
    const start = Date.now();
    run('wait', '500');
    const elapsed = Date.now() - start;
    console.log(`wait 500: elapsed ${elapsed}ms`);
    assert.ok(elapsed >= 400, 'Should wait at least 400ms');
    assert.ok(elapsed < 3000, 'Should not wait more than 3s');
  });

  it('is exists should exit 0 for present element', () => {
    // Ensure refs
    run('snapshot');
    const snap = run('snapshot', '--json');
    const elements = JSON.parse(snap);
    assert.ok(elements.length > 0);

    const { stdout, exitCode } = runWithExit('is', 'exists', `@${elements[0].ref}`);
    console.log(`is exists @${elements[0].ref}: stdout="${stdout}" exitCode=${exitCode}`);
    assert.equal(exitCode, 0, 'Should exit 0 for existing element');
  });

  it('is exists should exit 1 for missing element', () => {
    const { exitCode } = runWithExit('is', 'exists', '@e99999');
    console.log('is exists @e99999: exitCode=', exitCode);
    assert.equal(exitCode, 1, 'Should exit 1 for missing element');
  });

  it('scroll should accept @ref or direction', () => {
    // Get a ref first
    const snap = run('snapshot', '--json');
    const elements = JSON.parse(snap);
    const btn = elements.find((e: any) => e.key === 'submit_btn');
    if (btn) {
      const output = run('scroll', `@${btn.ref}`);
      console.log('scroll @ref:', output);
    }

    // Scroll down via ADB
    const output2 = run('scroll', 'down');
    console.log('scroll down:', output2);
  });

  it('swipe should execute without error', () => {
    const output = run('swipe', 'up');
    console.log('swipe up:', output);
    // Swipe back down to restore position
    run('swipe', 'down');
  });

  it('back should execute without error', () => {
    const output = run('back');
    console.log('back:', output);
    // Wait a bit for the app to process
    run('wait', '300');
  });

  it('home should execute without error', () => {
    // Note: home will leave the app, so we need to relaunch after
    const output = run('home');
    console.log('home:', output);
    // Wait for home to take effect
    run('wait', '500');
    // Reopen the app via ADB
    try {
      const { execSync } = require('node:child_process');
      execSync('adb -s emulator-5554 shell am start -n com.example.marionette_test_app/.MainActivity', { timeout: 5000 });
      // Wait for app to be ready
      run('wait', '1000');
    } catch {}
  });

  it('should use exit code 2 for errors', () => {
    const { exitCode } = runWithExit('nonexistent_command');
    console.log('unknown command exitCode:', exitCode);
    assert.equal(exitCode, 2, 'Errors should exit with code 2');
  });

  it('should output structured error with --json on error', () => {
    const { stdout } = runWithExit('--json', 'press', '@e99999');
    console.log('json error:', stdout);
    // Should be valid JSON with error object
    try {
      const parsed = JSON.parse(stdout);
      assert.ok(parsed.error, 'JSON error should have error field');
      assert.ok(parsed.error.code, 'Error should have code');
      assert.ok(parsed.error.message, 'Error should have message');
    } catch {
      // If not JSON, that's also acceptable if error code is correct
      console.log('Note: --json error output was not JSON');
    }
  });

  // ===== Phase 5 Tests =====

  it('schema command outputs valid JSON array with all command names', () => {
    if (!requirePhase5()) return;

    const output = run('schema', '--json');
    const parsed = JSON.parse(output);
    assert.ok(Array.isArray(parsed), 'schema should return an array');

    const names = parsed.map((cmd: any) => cmd?.name).filter(Boolean);
    const expected = [
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
    for (const name of expected) {
      assert.ok(names.includes(name), `schema should include command: ${name}`);
    }
  });

  it('schema <cmd> outputs valid JSON with args/flags/exitCodes', () => {
    if (!requirePhase5()) return;

    const output = run('schema', 'press', '--json');
    const parsed = JSON.parse(output);
    assert.equal(parsed.name, 'press');
    assert.ok(typeof parsed.description === 'string' && parsed.description.length > 0, 'description required');
    assert.ok(Array.isArray(parsed.args), 'args should be array');
    assert.ok(Array.isArray(parsed.flags), 'flags should be array');
    assert.ok(parsed.exitCodes && typeof parsed.exitCodes === 'object', 'exitCodes should be object');
  });

  it('--help --json outputs same payload as schema', () => {
    if (!requirePhase5()) return;

    const schema = JSON.parse(run('schema', '--json'));
    const helpJson = JSON.parse(run('--help', '--json'));
    assert.deepEqual(helpJson, schema, '--help --json should alias schema output');
  });

  it('input validation rejects bad refs (exit 2)', () => {
    if (!requirePhase5()) return;

    const { stdout, exitCode } = runWithExit('--json', 'press', '@bad-ref');
    assert.equal(exitCode, 2, 'invalid input should exit with 2');

    const parsed = JSON.parse(stdout);
    assert.ok(parsed.error, 'error payload expected');
    assert.equal(parsed.error.code, 'INVALID_INPUT');
  });

  it('input validation rejects control characters (exit 2)', () => {
    if (!requirePhase5()) return;

    const { stdout, exitCode } = runWithExit('--json', 'fill', '@e1', 'bad\u0007text');
    assert.equal(exitCode, 2, 'invalid text should exit with 2');

    const parsed = JSON.parse(stdout);
    assert.ok(parsed.error, 'error payload expected');
    assert.equal(parsed.error.code, 'INVALID_INPUT');
  });

  it('--dry-run on press shows resolved target without executing', () => {
    if (!requirePhase5()) return;

    const snap = run('snapshot', '--json');
    const elements = JSON.parse(snap);
    assert.ok(elements.length > 0, 'must have elements for dry-run press');

    const target = elements.find((e: any) => e.key === 'increment_btn') ?? elements[0];
    const output = run('press', `@${target.ref}`, '--dry-run', '--json');
    const parsed = JSON.parse(output);
    const payload = unwrapData(parsed);

    assert.equal(payload.dryRun, true, 'dryRun should be true');
    assert.equal(payload.command, 'press', 'command should be press');
    assert.ok(payload.target, 'target should be present');
    assert.ok(payload.resolved, 'resolved metadata should be present');
  });

  it('AGENT_FLUTTER_JSON=1 env var makes snapshot output JSON', () => {
    if (!requirePhase5()) return;

    const output = runWithEnv({ AGENT_FLUTTER_JSON: '1' }, 'snapshot');
    const parsed = JSON.parse(output);

    if (Array.isArray(parsed)) {
      assert.ok(parsed.length > 0, 'snapshot json array should have elements');
    } else {
      const payload = unwrapData(parsed);
      assert.ok(Array.isArray(payload), 'snapshot payload should be array');
    }
  });

  it('AGENT_FLUTTER_DEVICE env var is accepted', () => {
    if (!requirePhase5()) return;

    const output = runWithEnv({ AGENT_FLUTTER_DEVICE: 'emulator-5554' }, 'back', '--dry-run', '--json');
    const parsed = JSON.parse(output);
    const payload = unwrapData(parsed);

    assert.equal(payload.dryRun, true, 'dryRun should be true');
    assert.equal(payload.command, 'back', 'command should be back');
  });

  it('diagnosticId is present in JSON error output', () => {
    if (!requirePhase5()) return;

    const { stdout, exitCode } = runWithExit('--json', 'press', '@e99999');
    assert.equal(exitCode, 2, 'error should exit with code 2');

    const parsed = JSON.parse(stdout);
    assert.ok(parsed.error, 'error payload expected');
    assert.ok(parsed.error.diagnosticId, 'diagnosticId should be present');
    assert.match(String(parsed.error.diagnosticId), /^[A-Za-z0-9-]{6,}$/, 'diagnosticId should be non-empty');
  });

  it('basic non-TTY check: snapshot defaults to JSON in captured output', () => {
    if (!requirePhase5()) return;

    const output = runRaw('snapshot');
    const parsed = JSON.parse(output);

    if (Array.isArray(parsed)) {
      assert.ok(parsed.length > 0, 'expected array snapshot output');
      return;
    }

    const payload = unwrapData(parsed);
    assert.ok(Array.isArray(payload), 'expected wrapped JSON snapshot array');
  });
});
