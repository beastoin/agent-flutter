/**
 * doctor — Check prerequisites and diagnose connection issues.
 * Platform-aware: checks ADB on Android, xcrun simctl on iOS.
 */
import { resolveTransport } from '../transport/index.ts';
import { detectVmServiceUri } from '../auto-detect.ts';
import { loadSession } from '../session.ts';
import { VmServiceClient } from '../vm-client.ts';

type Check = {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  fix?: string;
};

export async function doctorCommand(args: string[]): Promise<void> {
  const isJson = process.env.AGENT_FLUTTER_JSON === '1';
  const transport = resolveTransport();
  const checks: Check[] = [];

  // 0. Platform
  checks.push({ name: 'platform', status: 'pass', message: `${transport.platform} (device: ${transport.deviceId})` });

  // 1. Platform tool available
  const toolCheck = transport.checkToolInstalled();
  if (toolCheck.ok) {
    checks.push({ name: 'tool', status: 'pass', message: toolCheck.message });
  } else {
    checks.push({ name: 'tool', status: 'fail', message: toolCheck.message });
  }

  // 2. Device connected
  if (toolCheck.ok) {
    const devices = transport.listDevices();
    if (devices.length === 0) {
      const fix = transport.platform === 'android'
        ? 'Connect a device via USB or start an emulator: emulator -avd <name>'
        : 'Boot a simulator: xcrun simctl boot <device>';
      checks.push({ name: 'device', status: 'fail', message: 'No devices connected', fix });
    } else {
      const targetFound = devices.includes(transport.deviceId) || transport.deviceId === 'booted';
      if (targetFound) {
        checks.push({ name: 'device', status: 'pass', message: `Device ${transport.deviceId} connected` });
      } else {
        const available = devices.join(', ');
        checks.push({
          name: 'device',
          status: 'warn',
          message: `Target device ${transport.deviceId} not found. Available: ${available}`,
          fix: `Use --device <id> or set AGENT_FLUTTER_DEVICE=${devices[0]}`,
        });
      }
    }
  } else {
    checks.push({ name: 'device', status: 'fail', message: 'Skipped (platform tool not available)' });
  }

  // 3. Flutter app running (VM Service URI)
  let vmUri: string | null = null;
  if (toolCheck.ok) {
    vmUri = transport.detectVmServiceUri();
    // Only try ADB-based detection on Android
    if (!vmUri && transport.platform === 'android') {
      vmUri = detectVmServiceUri(transport.deviceId);
    }
    if (vmUri) {
      checks.push({ name: 'flutter_app', status: 'pass', message: `VM Service found: ${vmUri}` });
    } else {
      checks.push({
        name: 'flutter_app',
        status: 'fail',
        message: 'No Flutter VM Service URI found',
        fix: 'Launch app with: flutter run (not adb install). The app must be running in debug or profile mode.',
      });
    }
  } else {
    checks.push({ name: 'flutter_app', status: 'fail', message: 'Skipped (no device)' });
  }

  // 4. Marionette extensions available
  if (vmUri) {
    const client = new VmServiceClient();
    try {
      await client.connect(vmUri);
      checks.push({ name: 'marionette', status: 'pass', message: 'Marionette extensions detected on isolate' });

      // 5. Can get elements
      try {
        const elements = await client.getInteractiveElements();
        checks.push({
          name: 'elements',
          status: elements.length > 0 ? 'pass' : 'warn',
          message: elements.length > 0 ? `${elements.length} interactive elements found` : 'No interactive elements (screen may be empty or loading)',
          fix: elements.length === 0 ? 'Wait for the app to finish loading, then run doctor again' : undefined,
        });
      } catch {
        checks.push({ name: 'elements', status: 'warn', message: 'Could not fetch elements (app may still be loading)' });
      }

      await client.disconnect();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('No isolate with Marionette extensions')) {
        checks.push({
          name: 'marionette',
          status: 'fail',
          message: 'Flutter app is running but Marionette is NOT initialized',
          fix: 'Add to your app main.dart:\n  import \'package:marionette_flutter/marionette_flutter.dart\';\n  void main() {\n    assert(() { MarionetteBinding.ensureInitialized(); return true; }());\n    runApp(const MyApp());\n  }\nThen add to pubspec.yaml dev_dependencies: marionette_flutter: ^0.3.0',
        });
      } else {
        checks.push({
          name: 'marionette',
          status: 'fail',
          message: `Connection failed: ${msg}`,
          fix: transport.platform === 'android'
            ? 'Check that the VM Service port is forwarded: adb forward tcp:<port> tcp:<port>'
            : 'Check that the VM Service is accessible on localhost',
        });
      }
    }
  } else {
    checks.push({ name: 'marionette', status: 'fail', message: 'Skipped (no VM Service)' });
  }

  // 6. Existing session
  const session = loadSession();
  if (session) {
    checks.push({ name: 'session', status: 'pass', message: `Connected to ${session.vmServiceUri}` });
  } else {
    checks.push({
      name: 'session',
      status: 'warn',
      message: 'No active session',
      fix: 'Run: agent-flutter connect',
    });
  }

  // Output
  const allPass = checks.every((c) => c.status === 'pass');
  const hasFail = checks.some((c) => c.status === 'fail');

  if (isJson) {
    console.log(JSON.stringify({ checks, allPass }));
  } else {
    for (const check of checks) {
      const icon = check.status === 'pass' ? '[OK]' : check.status === 'warn' ? '[WARN]' : '[FAIL]';
      console.log(`${icon} ${check.name}: ${check.message}`);
      if (check.fix) {
        console.log(`     Fix: ${check.fix}`);
      }
    }
    console.log(allPass ? '\nAll checks passed.' : hasFail ? '\nSome checks failed. Fix the issues above.' : '\nWarnings found but core requirements met.');
  }

  if (hasFail) process.exit(2);
}
