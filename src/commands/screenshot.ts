/**
 * screenshot [path] — Capture screenshot via Marionette or ADB fallback.
 */
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { VmServiceClient } from '../vm-client.ts';
import { loadSession } from '../session.ts';
import { AgentFlutterError, ErrorCodes } from '../errors.ts';

const HELP = `Usage: agent-flutter screenshot [path]

  Capture screenshot. Default: screenshot.png
  Uses Marionette first, falls back to ADB screencap.`;

export async function screenshotCommand(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const outPath = args[0] ?? 'screenshot.png';

  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, 'Not connected', 'Run: agent-flutter connect');

  // Try Marionette screenshot first, fall back to ADB
  const client = new VmServiceClient();
  await client.connect(session.vmServiceUri);
  try {
    const buf = await client.takeScreenshot();
    if (buf) {
      writeFileSync(outPath, buf);
      console.log(`Screenshot saved: ${outPath}`);
      return;
    }
  } catch {
    // Marionette screenshot not available, fall back to ADB
  } finally {
    await client.disconnect();
  }

  // ADB fallback
  const deviceId = process.env.AGENT_FLUTTER_DEVICE ?? 'emulator-5554';
  try {
    const raw = execSync(`adb -s ${deviceId} shell screencap -p`, {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 10000,
    });
    writeFileSync(outPath, raw);
    console.log(`Screenshot saved (via ADB): ${outPath}`);
  } catch {
    throw new AgentFlutterError(ErrorCodes.COMMAND_FAILED, 'Failed to capture screenshot via both Marionette and ADB');
  }
}
