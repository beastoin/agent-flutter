/**
 * back [--dry-run] — Navigate back (ADB keyevent on Android, swipe-from-edge on iOS).
 */
import { resolveTransport } from '../transport/index.ts';

export async function backCommand(args?: string[]): Promise<void> {
  const isDryRun = args?.includes('--dry-run') || process.env.AGENT_FLUTTER_DRY_RUN === '1';
  const transport = resolveTransport();

  if (isDryRun) {
    console.log(JSON.stringify({ dryRun: true, command: 'back', device: transport.deviceId, platform: transport.platform }));
    return;
  }

  transport.keyevent('back');
  console.log('Back');
}
