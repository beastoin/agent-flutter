/**
 * Contract tests for agent-flutter.
 * Verifies JSON shapes, error shapes, exit codes, and schema structure.
 * No VM connection required.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentFlutterError, ErrorCodes, formatError } from '../src/errors.ts';
import { getSchema, COMMAND_SCHEMAS } from '../src/command-schema.ts';
import { validateRef, validateTextArg, validatePathArg, validateDeviceId } from '../src/validate.ts';

describe('Schema contract', () => {
  it('schema returns array of all commands', () => {
    const schema = getSchema();
    assert.ok(Array.isArray(schema));
    const names = (schema as any[]).map((s) => s.name);
    const expected = ['connect', 'disconnect', 'status', 'snapshot', 'press', 'fill', 'get',
      'find', 'wait', 'is', 'scroll', 'swipe', 'back', 'home', 'screenshot', 'reload', 'logs', 'schema'];
    for (const name of expected) {
      assert.ok(names.includes(name), `schema should include: ${name}`);
    }
  });

  it('schema(cmd) returns single command object', () => {
    const schema = getSchema('press');
    assert.ok(schema && !Array.isArray(schema));
    assert.equal((schema as any).name, 'press');
  });

  it('each command schema has required fields', () => {
    for (const schema of COMMAND_SCHEMAS) {
      assert.ok(typeof schema.name === 'string' && schema.name.length > 0, `${schema.name}: name`);
      assert.ok(typeof schema.description === 'string' && schema.description.length > 0, `${schema.name}: description`);
      assert.ok(Array.isArray(schema.args), `${schema.name}: args`);
      assert.ok(Array.isArray(schema.flags), `${schema.name}: flags`);
      assert.ok(schema.exitCodes && typeof schema.exitCodes === 'object', `${schema.name}: exitCodes`);
      assert.ok(Array.isArray(schema.examples), `${schema.name}: examples`);
    }
  });

  it('schema(unknown) returns null', () => {
    const schema = getSchema('nonexistent');
    assert.equal(schema, null);
  });
});

describe('Error contract', () => {
  it('JSON error has code, message, diagnosticId', () => {
    const err = new AgentFlutterError(ErrorCodes.NOT_CONNECTED, 'Not connected');
    const output = formatError(err, true);
    const parsed = JSON.parse(output);
    assert.ok(parsed.error);
    assert.equal(parsed.error.code, 'NOT_CONNECTED');
    assert.equal(parsed.error.message, 'Not connected');
    assert.ok(parsed.error.diagnosticId, 'diagnosticId required');
    assert.ok(parsed.error.diagnosticId.length >= 6, 'diagnosticId should be at least 6 chars');
  });

  it('human error has code:diagnosticId format', () => {
    const err = new AgentFlutterError(ErrorCodes.TIMEOUT, 'Timed out');
    const output = formatError(err, false);
    assert.match(output, /Error \[TIMEOUT:[a-f0-9]+\]/, 'should have code:diagnosticId format');
  });

  it('generic error has diagnosticId', () => {
    const err = new Error('generic failure');
    const jsonOutput = formatError(err, true);
    const parsed = JSON.parse(jsonOutput);
    assert.ok(parsed.error.diagnosticId);
    assert.equal(parsed.error.code, 'COMMAND_FAILED');
  });

  it('INVALID_INPUT error code exists', () => {
    assert.equal(ErrorCodes.INVALID_INPUT, 'INVALID_INPUT');
    const err = new AgentFlutterError(ErrorCodes.INVALID_INPUT, 'bad input');
    const output = formatError(err, true);
    const parsed = JSON.parse(output);
    assert.equal(parsed.error.code, 'INVALID_INPUT');
  });
});

describe('Validation contract', () => {
  it('validateRef accepts valid refs', () => {
    validateRef('@e1');
    validateRef('@e42');
    validateRef('e1');
    validateRef('e999');
  });

  it('validateRef rejects invalid refs', () => {
    assert.throws(() => validateRef('@abc'), { message: /Invalid ref/ });
    assert.throws(() => validateRef('@bad-ref'), { message: /Invalid ref/ });
    assert.throws(() => validateRef('hello'), { message: /Invalid ref/ });
    assert.throws(() => validateRef('@e'), { message: /Invalid ref/ });
  });

  it('validateTextArg accepts normal text', () => {
    validateTextArg('hello world');
    validateTextArg('line1\nline2');
    validateTextArg('tab\there');
  });

  it('validateTextArg rejects control chars', () => {
    assert.throws(() => validateTextArg('bad\u0007text'), { message: /control/ });
    assert.throws(() => validateTextArg('bad\u0001text'), { message: /control/ });
  });

  it('validatePathArg accepts valid paths', () => {
    validatePathArg('/tmp/screenshot.png');
    validatePathArg('screenshot.png');
    validatePathArg('/tmp/deep/nested/file.png');
  });

  it('validatePathArg rejects traversal', () => {
    assert.throws(() => validatePathArg('../etc/passwd'), { message: /traversal/ });
    assert.throws(() => validatePathArg('~/secret'), { message: /Home-relative/ });
    assert.throws(() => validatePathArg('/etc/passwd'), { message: /outside \/tmp/ });
  });

  it('validateDeviceId accepts valid IDs', () => {
    validateDeviceId('emulator-5554');
    validateDeviceId('192.168.1.100:5555');
    validateDeviceId('ABC123');
  });

  it('validateDeviceId rejects invalid IDs', () => {
    assert.throws(() => validateDeviceId('device;rm -rf'), { message: /Invalid device/ });
    assert.throws(() => validateDeviceId('dev ice'), { message: /Invalid device/ });
  });
});
