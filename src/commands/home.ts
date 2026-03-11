/**
 * home [--dry-run] — Home button (ADB keyevent on Android, simctl on iOS).
 */
import { resolveTransport } from '../transport/index.ts';

export async function homeCommand(args?: string[]): Promise<void> {
  const isDryRun = args?.includes('--dry-run') || process.env.AGENT_FLUTTER_DRY_RUN === '1';
  const transport = resolveTransport();

  if (isDryRun) {
    console.log(JSON.stringify({ dryRun: true, command: 'home', device: transport.deviceId, platform: transport.platform }));
    return;
  }

  transport.keyevent('home');
  console.log('Home');
}
