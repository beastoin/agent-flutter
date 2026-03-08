/**
 * Auto-detect Flutter VM Service URI from adb logcat.
 */
import { execSync } from 'node:child_process';

/**
 * Parse adb logcat output for the Flutter VM Service URI.
 * Returns the WebSocket URI or null if not found.
 */
export function detectVmServiceUri(deviceId?: string): string | null {
  const device = deviceId ?? process.env.AGENT_FLUTTER_DEVICE ?? 'emulator-5554';
  try {
    const logcat = execSync(`adb -s ${device} logcat -d -s flutter`, {
      encoding: 'utf-8',
      timeout: 10000,
    });
    // Match the VM Service URI pattern
    const match = logcat.match(/http:\/\/127\.0\.0\.1:\d+\/[^/]+\//);
    if (!match) return null;

    const httpUri = match[0];
    // Convert to WebSocket URI
    const wsUri = httpUri.replace('http://', 'ws://') + 'ws';
    return wsUri;
  } catch {
    return null;
  }
}

/**
 * Extract port from a VM Service URI and set up ADB port forwarding.
 */
export function setupPortForwarding(uri: string, deviceId?: string): void {
  const device = deviceId ?? process.env.AGENT_FLUTTER_DEVICE ?? 'emulator-5554';
  const portMatch = uri.match(/:(\d+)\//);
  if (!portMatch) return;
  const port = portMatch[1];
  try {
    execSync(`adb -s ${device} forward tcp:${port} tcp:${port}`, { timeout: 5000 });
  } catch {
    // Port forwarding may already exist
  }
}
