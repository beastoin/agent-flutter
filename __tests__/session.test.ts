import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSession, saveSession, clearSession, updateRefs, resolveRef } from '../src/session.ts';
import type { SessionData } from '../src/session.ts';
import type { RefElement } from '../src/snapshot-fmt.ts';

// Use test-specific home to avoid polluting real session
process.env.AGENT_FLUTTER_HOME = '/tmp/agent-flutter-test-session';

test('saveSession and loadSession round-trip', () => {
  const session: SessionData = {
    vmServiceUri: 'ws://127.0.0.1:12345/ws',
    isolateId: 'isolates/123',
    refs: {},
    lastSnapshot: [],
    connectedAt: '2026-03-08T00:00:00Z',
  };
  saveSession(session);
  const loaded = loadSession();
  assert.deepEqual(loaded, session);
});

test('clearSession removes session', () => {
  saveSession({
    vmServiceUri: 'ws://127.0.0.1:12345/ws',
    isolateId: 'isolates/123',
    refs: {},
    lastSnapshot: [],
    connectedAt: '2026-03-08T00:00:00Z',
  });
  clearSession();
  assert.equal(loadSession(), null);
});

test('updateRefs populates session.refs', () => {
  const session: SessionData = {
    vmServiceUri: 'ws://127.0.0.1:12345/ws',
    isolateId: 'isolates/123',
    refs: {},
    lastSnapshot: [],
    connectedAt: '2026-03-08T00:00:00Z',
  };
  const refs: RefElement[] = [
    { ref: 'e1', type: 'Text', text: 'Hello', visible: true, bounds: { x: 0, y: 0, width: 100, height: 20 } },
    { ref: 'e2', type: 'Button', key: 'btn', visible: true, bounds: { x: 0, y: 20, width: 100, height: 48 } },
  ];
  updateRefs(session, refs);
  assert.equal(Object.keys(session.refs).length, 2);
  assert.equal(session.refs.e1.text, 'Hello');
  assert.equal(session.refs.e2.key, 'btn');
});

test('resolveRef with @e1 syntax', () => {
  const session: SessionData = {
    vmServiceUri: 'ws://127.0.0.1:12345/ws',
    isolateId: 'isolates/123',
    refs: {
      e1: { ref: 'e1', type: 'Text', text: 'Hello', visible: true, bounds: { x: 0, y: 0, width: 100, height: 20 } },
    },
    lastSnapshot: [],
    connectedAt: '2026-03-08T00:00:00Z',
  };
  const el = resolveRef(session, '@e1');
  assert.equal(el?.text, 'Hello');
});

test('resolveRef with e1 syntax (no @)', () => {
  const session: SessionData = {
    vmServiceUri: 'ws://127.0.0.1:12345/ws',
    isolateId: 'isolates/123',
    refs: {
      e1: { ref: 'e1', type: 'Text', text: 'Hello', visible: true, bounds: { x: 0, y: 0, width: 100, height: 20 } },
    },
    lastSnapshot: [],
    connectedAt: '2026-03-08T00:00:00Z',
  };
  const el = resolveRef(session, 'e1');
  assert.equal(el?.text, 'Hello');
});

test('resolveRef returns null for unknown ref', () => {
  const session: SessionData = {
    vmServiceUri: 'ws://127.0.0.1:12345/ws',
    isolateId: 'isolates/123',
    refs: {},
    lastSnapshot: [],
    connectedAt: '2026-03-08T00:00:00Z',
  };
  assert.equal(resolveRef(session, '@e99'), null);
});
