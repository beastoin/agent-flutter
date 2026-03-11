/**
 * Auto-detect Flutter VM Service URI.
 * Priority: AGENT_FLUTTER_LOG (host-side) > logcat (device-side, less reliable).
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createConnection } from 'node:net';

import type { StdioOptions } from 'node:child_process';
const PIPE_STDIO: StdioOptions = ['pipe', 'pipe', 'pipe'];

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
 * Read the host-side VM Service URI from flutter run's log file.
 * Set AGENT_FLUTTER_LOG to the path where flutter run output is captured.
 * The host URI has the correct port and auth token for host-side access.
 *
 * flutter run prints: "A Dart VM Service on <device> is available at: http://127.0.0.1:<port>/<token>/"
 */
function detectFromFlutterLog(): string | null {
  const logPath = process.env.AGENT_FLUTTER_LOG;
  if (!logPath) return null;
  try {
    const log = readFileSync(logPath, 'utf-8');
    // Match the host-side URI from flutter run output
    const matches = log.match(/is available at: (http:\/\/127\.0\.0\.1:\d+\/[^/]+\/)/g);
    if (!matches || matches.length === 0) return null;
    // Take last match (most recent)
    const last = matches[matches.length - 1];
    const uriMatch = last.match(/(http:\/\/127\.0\.0\.1:\d+\/[^/]+\/)/);
    if (!uriMatch) return null;
    return uriMatch[1].replace('http://', 'ws://') + 'ws';
  } catch {
    return null;
  }
}

/**
 * Parse adb logcat output for the Flutter VM Service URI.
 * Returns the WebSocket URI or null if not found.
 * NOTE: logcat URIs are device-side and may not work from the host.
 * Prefer AGENT_FLUTTER_LOG or explicit URI.
 */
export function detectVmServiceUri(deviceId?: string): string | null {
  const device = deviceId ?? process.env.AGENT_FLUTTER_DEVICE ?? 'emulator-5554';
  try {
    const logcat = execSync(`adb -s ${device} logcat -d -s flutter`, {
      encoding: 'utf-8',
      timeout: 10000,
      maxBuffer: 10 * 1024 * 1024, // 10MB — Omi logcat can exceed default 1MB
      stdio: PIPE_STDIO,
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
 * Async auto-detect with priority:
 * 1. AGENT_FLUTTER_LOG — host-side URI from flutter run log (correct port + token)
 * 2. logcat — device-side URI (needs port forwarding, may have wrong token)
 */
export async function detectVmServiceUriAsync(deviceId?: string): Promise<string | null> {
  // Priority 1: flutter run log file (host-side URI, always correct)
  const fromLog = detectFromFlutterLog();
  if (fromLog) {
    const portMatch = fromLog.match(/:(\d+)\//);
    if (portMatch && await isPortOpen(parseInt(portMatch[1], 10))) {
      return fromLog;
    }
  }

  // Priority 2: logcat (device-side, less reliable)
  // Skip on iOS — logcat is Android-only
  if (process.env.AGENT_FLUTTER_PLATFORM === 'ios') return null;

  const device = deviceId ?? process.env.AGENT_FLUTTER_DEVICE ?? 'emulator-5554';
  try {
    const logcat = execSync(`adb -s ${device} logcat -d -s flutter`, {
      encoding: 'utf-8',
      timeout: 10000,
      maxBuffer: 10 * 1024 * 1024, // 10MB — Omi logcat can exceed default 1MB
      stdio: PIPE_STDIO,
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
        execSync(`adb -s ${device} forward tcp:${port} tcp:${port}`, { timeout: 5000, stdio: PIPE_STDIO });
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
 * Extract port from a VM Service URI and set up port forwarding via transport.
 */
export function setupPortForwarding(uri: string, deviceId?: string): void {
  const device = deviceId ?? process.env.AGENT_FLUTTER_DEVICE ?? 'emulator-5554';
  const portMatch = uri.match(/:(\d+)\//);
  if (!portMatch) return;
  const port = portMatch[1];
  // Use ADB for Android, no-op for iOS (simulator shares host network)
  const platform = process.env.AGENT_FLUTTER_PLATFORM;
  if (platform === 'ios') return;
  try {
    execSync(`adb -s ${device} forward tcp:${port} tcp:${port}`, { timeout: 5000, stdio: PIPE_STDIO });
  } catch {
    // Port forwarding may already exist
  }
}
