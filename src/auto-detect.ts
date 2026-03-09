/**
 * Auto-detect Flutter VM Service URI from adb logcat.
 */
import { execSync } from 'node:child_process';
import { createConnection } from 'node:net';

/**
 * Check if a TCP port is open on localhost.
 */
function isPortOpen(port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { resolve(false); });
  });
}

/**
 * Parse adb logcat output for the Flutter VM Service URI.
 * Returns the WebSocket URI or null if not found.
 * Takes the last match (most recent) and validates the port is open.
 */
export function detectVmServiceUri(deviceId?: string): string | null {
  const device = deviceId ?? process.env.AGENT_FLUTTER_DEVICE ?? 'emulator-5554';
  try {
    const logcat = execSync(`adb -s ${device} logcat -d -s flutter`, {
      encoding: 'utf-8',
      timeout: 10000,
      maxBuffer: 10 * 1024 * 1024, // 10MB — Omi logcat can exceed default 1MB
    });
    // Match ALL VM Service URI patterns and take the LAST one (most recent).
    // logcat -d dumps the entire buffer, so old entries from previous runs appear first.
    const matches = logcat.match(/http:\/\/127\.0\.0\.1:\d+\/[^/]+\//g);
    if (!matches || matches.length === 0) return null;

    // Deduplicate and reverse (most recent first)
    const unique = [...new Set(matches)].reverse();
    const httpUri = unique[0];
    // Convert to WebSocket URI
    const wsUri = httpUri.replace('http://', 'ws://') + 'ws';
    return wsUri;
  } catch {
    return null;
  }
}

/**
 * Async version that validates the port is actually open.
 * Falls back through matches from most recent to oldest.
 */
export async function detectVmServiceUriAsync(deviceId?: string): Promise<string | null> {
  const device = deviceId ?? process.env.AGENT_FLUTTER_DEVICE ?? 'emulator-5554';
  try {
    // Set up port forwarding for all candidate ports first
    const logcat = execSync(`adb -s ${device} logcat -d -s flutter`, {
      encoding: 'utf-8',
      timeout: 10000,
      maxBuffer: 10 * 1024 * 1024, // 10MB — Omi logcat can exceed default 1MB
    });
    const matches = logcat.match(/http:\/\/127\.0\.0\.1:\d+\/[^/]+\//g);
    if (!matches || matches.length === 0) return null;

    // Deduplicate and reverse (most recent first)
    const unique = [...new Set(matches)].reverse();

    for (const httpUri of unique) {
      const portMatch = httpUri.match(/:(\d+)\//);
      if (!portMatch) continue;
      const port = parseInt(portMatch[1], 10);

      // Set up port forwarding
      try {
        execSync(`adb -s ${device} forward tcp:${port} tcp:${port}`, { timeout: 5000 });
      } catch { /* may already exist */ }

      // Check if port is actually open
      if (await isPortOpen(port)) {
        return httpUri.replace('http://', 'ws://') + 'ws';
      }
    }
    return null;
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
