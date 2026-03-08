/**
 * doctor — Check prerequisites and diagnose connection issues.
 */
import { execSync } from 'node:child_process';
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
  const deviceId = process.env.AGENT_FLUTTER_DEVICE ?? 'emulator-5554';
  const checks: Check[] = [];

  // 1. ADB available
  try {
    execSync('adb version', { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
    checks.push({ name: 'adb', status: 'pass', message: 'ADB is installed' });
  } catch {
    checks.push({
      name: 'adb',
      status: 'fail',
      message: 'ADB not found',
      fix: 'Install Android SDK Platform Tools and add to PATH',
    });
  }

  // 2. Device connected
  if (checks[0].status === 'pass') {
    try {
      const devices = execSync('adb devices', { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
      const lines = devices.trim().split('\n').slice(1).filter((l) => l.includes('\tdevice'));
      if (lines.length === 0) {
        checks.push({
          name: 'device',
          status: 'fail',
          message: 'No ADB devices connected',
          fix: 'Connect a device via USB or start an emulator: emulator -avd <name>',
        });
      } else {
        const targetFound = lines.some((l) => l.startsWith(deviceId));
        if (targetFound) {
          checks.push({ name: 'device', status: 'pass', message: `Device ${deviceId} connected` });
        } else {
          const available = lines.map((l) => l.split('\t')[0]).join(', ');
          checks.push({
            name: 'device',
            status: 'warn',
            message: `Target device ${deviceId} not found. Available: ${available}`,
            fix: `Use --device <id> or set AGENT_FLUTTER_DEVICE=${lines[0].split('\t')[0]}`,
          });
        }
      }
    } catch {
      checks.push({ name: 'device', status: 'fail', message: 'Failed to list ADB devices' });
    }
  } else {
    checks.push({ name: 'device', status: 'fail', message: 'Skipped (ADB not available)' });
  }

  // 3. Flutter app running (VM Service URI in logcat)
  let vmUri: string | null = null;
  if (checks[0].status === 'pass') {
    vmUri = detectVmServiceUri(deviceId);
    if (vmUri) {
      checks.push({ name: 'flutter_app', status: 'pass', message: `VM Service found: ${vmUri}` });
    } else {
      checks.push({
        name: 'flutter_app',
        status: 'fail',
        message: 'No Flutter VM Service URI found in logcat',
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
          fix: 'Check that the VM Service port is forwarded: adb forward tcp:<port> tcp:<port>',
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
