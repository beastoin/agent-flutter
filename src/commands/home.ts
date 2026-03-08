/**
 * home [--dry-run] — Android home button via ADB.
 */
import { execSync } from 'node:child_process';

export async function homeCommand(args?: string[]): Promise<void> {
  const isDryRun = args?.includes('--dry-run') || process.env.AGENT_FLUTTER_DRY_RUN === '1';
  const deviceId = process.env.AGENT_FLUTTER_DEVICE ?? 'emulator-5554';

  if (isDryRun) {
    console.log(JSON.stringify({ dryRun: true, command: 'home', device: deviceId }));
    return;
  }

  execSync(`adb -s ${deviceId} shell input keyevent 3`, { timeout: 5000 });
  console.log('Home');
}
