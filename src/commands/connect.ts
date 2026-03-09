/**
 * connect [uri] — Connect to Flutter VM Service.
 * Auto-detects from adb logcat if no URI given.
 */
import { VmServiceClient } from '../vm-client.ts';
import { saveSession, clearSession } from '../session.ts';
import { detectVmServiceUriAsync, setupPortForwarding } from '../auto-detect.ts';

export async function connectCommand(args: string[]): Promise<void> {
  let uri = args[0] ?? process.env.AGENT_FLUTTER_URI;

  if (!uri) {
    // Auto-detect from logcat, validating port is open
    const detected = await detectVmServiceUriAsync();
    if (!detected) {
      throw new Error(
        'Could not detect Flutter VM Service URI.\n' +
        'Make sure a Flutter app is running on the emulator.\n' +
        'Or provide the URI directly: agent-flutter connect ws://...',
      );
    }
    uri = detected;
    console.log(`Auto-detected: ${uri}`);
  } else {
    // Normalize and forward port if needed
    if (uri.startsWith('http://') || uri.startsWith('ws://')) {
      setupPortForwarding(uri);
    }
  }

  const client = new VmServiceClient();
  await client.connect(uri);
  const isolateId = client.currentIsolateId!;
  await client.disconnect();

  saveSession({
    vmServiceUri: uri,
    isolateId,
    refs: {},
    lastSnapshot: [],
    connectedAt: new Date().toISOString(),
  });

  console.log(`Connected to Flutter app (isolate: ${isolateId})`);
}
