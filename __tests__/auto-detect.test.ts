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

test('flutter run log: extracts host-side URI', () => {
  const log = `Launching lib/main.dart on sdk gphone64 x86 64 in debug mode...
Running Gradle task 'assembleDevDebug'...
✓  Built build/app/outputs/flutter-apk/app-dev-debug.apk
Installing build/app/outputs/flutter-apk/app-dev-debug.apk...
Syncing files to device sdk gphone64 x86 64...
A Dart VM Service on sdk gphone64 x86 64 is available at: http://127.0.0.1:40981/2T-Vm83qhzA=/
The Flutter DevTools debugger and profiler on sdk gphone64 x86 64 is available at: http://127.0.0.1:9100?uri=http://127.0.0.1:40981/2T-Vm83qhzA=/`;
  const matches = log.match(/is available at: (http:\/\/127\.0\.0\.1:\d+\/[^/]+\/)/g);
  assert.ok(matches);
  assert.equal(matches!.length, 1);
  const uriMatch = matches![0].match(/(http:\/\/127\.0\.0\.1:\d+\/[^/]+\/)/);
  assert.ok(uriMatch);
  assert.equal(uriMatch![1], 'http://127.0.0.1:40981/2T-Vm83qhzA=/');
});

test('flutter run log: picks last URI on app restart', () => {
  const log = `A Dart VM Service on device is available at: http://127.0.0.1:33211/OldToken=/
Performing hot restart...
A Dart VM Service on device is available at: http://127.0.0.1:40981/NewToken=/`;
  const matches = log.match(/is available at: (http:\/\/127\.0\.0\.1:\d+\/[^/]+\/)/g);
  assert.ok(matches);
  assert.equal(matches!.length, 2);
  const last = matches![matches!.length - 1];
  const uriMatch = last.match(/(http:\/\/127\.0\.0\.1:\d+\/[^/]+\/)/);
  assert.equal(uriMatch![1], 'http://127.0.0.1:40981/NewToken=/');
});

test('port extraction from URI', () => {
  const uri = 'ws://127.0.0.1:42003/LhyO56VuSHI=/ws';
  const portMatch = uri.match(/:(\d+)\//);
  assert.ok(portMatch);
  assert.equal(portMatch![1], '42003');
});
