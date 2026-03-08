import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentFlutterError, ErrorCodes, formatError } from '../src/errors.ts';

describe('AgentFlutterError', () => {
  it('should construct with code and message', () => {
    const err = new AgentFlutterError(ErrorCodes.NOT_CONNECTED, 'Not connected');
    assert.equal(err.code, 'NOT_CONNECTED');
    assert.equal(err.message, 'Not connected');
    assert.equal(err.hint, undefined);
    assert.equal(err.name, 'AgentFlutterError');
  });

  it('should construct with hint', () => {
    const err = new AgentFlutterError(ErrorCodes.NOT_CONNECTED, 'Not connected', 'Run: agent-flutter connect');
    assert.equal(err.hint, 'Run: agent-flutter connect');
  });

  it('should format human error', () => {
    const err = new AgentFlutterError(ErrorCodes.NOT_CONNECTED, 'Not connected', 'Run: agent-flutter connect');
    const output = formatError(err, false);
    assert.match(output, /\[NOT_CONNECTED:[a-f0-9]+\]/);
    assert.ok(output.includes('Not connected'));
    assert.ok(output.includes('Hint: Run: agent-flutter connect'));
  });

  it('should format JSON error', () => {
    const err = new AgentFlutterError(ErrorCodes.TIMEOUT, 'Timed out');
    const output = formatError(err, true);
    const parsed = JSON.parse(output);
    assert.equal(parsed.error.code, 'TIMEOUT');
    assert.equal(parsed.error.message, 'Timed out');
  });

  it('should format generic error', () => {
    const err = new Error('something broke');
    const output = formatError(err, false);
    assert.ok(output.includes('something broke'));
  });

  it('should format generic error as JSON', () => {
    const err = new Error('something broke');
    const output = formatError(err, true);
    const parsed = JSON.parse(output);
    assert.equal(parsed.error.code, 'COMMAND_FAILED');
  });
});
