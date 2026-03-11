/**
 * Transport resolution — picks the right DeviceTransport based on platform.
 *
 * Detection priority:
 * 1. --platform flag (via AGENT_FLUTTER_PLATFORM env)
 * 2. Device ID format heuristic
 * 3. Default: android
 */
import { AdbTransport } from './adb.ts';
import { IosSimTransport } from './ios-sim.ts';
import type { DeviceTransport } from './types.ts';

export type { DeviceTransport, ScreenSize, DialogInfo, ToolCheck } from './types.ts';

/**
 * Detect platform from device ID format.
 * - "emulator-NNNN" or serial-like strings → android
 * - UUID (8-4-4-4-12) or "booted" → ios simulator
 */
function detectPlatform(deviceId: string): 'android' | 'ios' {
  // Explicit UUID format (iOS simulator)
  if (/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(deviceId)) {
    return 'ios';
  }
  // "booted" keyword → iOS simulator
  if (deviceId === 'booted') {
    return 'ios';
  }
  // Everything else → Android
  return 'android';
}

/**
 * Resolve the correct transport for the current device.
 */
export function resolveTransport(deviceId?: string): DeviceTransport {
  const device = deviceId ?? process.env.AGENT_FLUTTER_DEVICE ?? 'emulator-5554';
  const explicitPlatform = process.env.AGENT_FLUTTER_PLATFORM as 'android' | 'ios' | undefined;
  const platform = explicitPlatform ?? detectPlatform(device);

  if (platform === 'ios') {
    return new IosSimTransport(device);
  }
  return new AdbTransport(device);
}
