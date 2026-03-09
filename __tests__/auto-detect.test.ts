import test from 'node:test';
import assert from 'node:assert/strict';

// We can't easily mock execSync, so test the URI parsing logic separately
test('detectVmServiceUri: URI format parsing', () => {
  // Test the regex pattern used in auto-detect
  const logcat = `
I/flutter ( 1234): Observatory listening on http://127.0.0.1:42003/LhyO56VuSHI=/
I/flutter ( 1234): Some other log line
  `;
  const match = logcat.match(/http:\/\/127\.0\.0\.1:\d+\/[^/]+\//);
  assert.ok(match, 'Should find URI in logcat');
  assert.equal(match![0], 'http://127.0.0.1:42003/LhyO56VuSHI=/');

  // Convert to WS
  const wsUri = match![0].replace('http://', 'ws://') + 'ws';
  assert.equal(wsUri, 'ws://127.0.0.1:42003/LhyO56VuSHI=/ws');
});

test('detectVmServiceUri: no match returns null', () => {
  const logcat = 'I/flutter: Just some normal log output';
  const match = logcat.match(/http:\/\/127\.0\.0\.1:\d+\/[^/]+\//);
  assert.equal(match, null);
});

test('detectVmServiceUri: picks last match (most recent)', () => {
  const logcat = `
I/flutter ( 1234): Observatory listening on http://127.0.0.1:40001/OldToken=/
I/flutter ( 1234): Observatory listening on http://127.0.0.1:42003/NewToken=/
  `;
  const matches = logcat.match(/http:\/\/127\.0\.0\.1:\d+\/[^/]+\//g);
  assert.ok(matches);
  assert.equal(matches!.length, 2);
  const lastUri = matches![matches!.length - 1];
  assert.equal(lastUri, 'http://127.0.0.1:42003/NewToken=/');
});

test('port extraction from URI', () => {
  const uri = 'ws://127.0.0.1:42003/LhyO56VuSHI=/ws';
  const portMatch = uri.match(/:(\d+)\//);
  assert.ok(portMatch);
  assert.equal(portMatch![1], '42003');
});
