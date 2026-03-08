/**
 * back [--dry-run] — Android back button via ADB.
 */
import { execSync } from 'node:child_process';

export async function backCommand(args?: string[]): Promise<void> {
  const isDryRun = args?.includes('--dry-run') || process.env.AGENT_FLUTTER_DRY_RUN === '1';
  const deviceId = process.env.AGENT_FLUTTER_DEVICE ?? 'emulator-5554';

  if (isDryRun) {
    console.log(JSON.stringify({ dryRun: true, command: 'back', device: deviceId }));
    return;
  }

  execSync(`adb -s ${deviceId} shell input keyevent 4`, { timeout: 5000 });
  console.log('Back');
}
