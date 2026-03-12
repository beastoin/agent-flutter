/**
 * IosSimTransport — iOS Simulator transport via xcrun simctl + cliclick.
 *
 * Input injection uses cliclick (macOS CLI click tool) to click/drag on the
 * Simulator.app window. Coordinates are translated from device physical pixels
 * to macOS screen points using the Simulator window bounds and device logical resolution.
 *
 * Home button uses AppleScript (Shift+Cmd+H shortcut).
 */
import { execSync } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';
import type { DeviceTransport, ScreenSize, DialogInfo, ToolCheck, TextEntry } from './types.ts';

/** Logical resolution (points) for known device types */
const DEVICE_LOGICAL_SIZES: Record<string, { width: number; height: number }> = {
  'iPhone-17-Pro-Max': { width: 430, height: 932 },
  'iPhone-16-Pro-Max': { width: 430, height: 932 },
  'iPhone-15-Pro-Max': { width: 430, height: 932 },
  'iPhone-17-Pro': { width: 393, height: 852 },
  'iPhone-16-Pro': { width: 393, height: 852 },
  'iPhone-15-Pro': { width: 393, height: 852 },
  'iPhone-17': { width: 390, height: 844 },
  'iPhone-16': { width: 390, height: 844 },
  'iPhone-15': { width: 390, height: 844 },
  'iPhone-SE': { width: 375, height: 667 },
  'iPad-Pro-13': { width: 1024, height: 1366 },
  'iPad-Pro-11': { width: 834, height: 1194 },
  'iPad-Air': { width: 834, height: 1194 },
};

/** macOS title bar height in points */
const TITLEBAR_HEIGHT = 52;

export class IosSimTransport implements DeviceTransport {
  readonly platform = 'ios' as const;
  readonly deviceId: string;

  constructor(deviceId: string) {
    this.deviceId = deviceId;
  }

  private simctl(cmd: string, opts?: { timeout?: number; maxBuffer?: number }): string {
    return execSync(`xcrun simctl ${cmd}`, {
      encoding: 'utf8',
      timeout: opts?.timeout ?? 5000,
      maxBuffer: opts?.maxBuffer,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  }

  /** Get the Simulator.app window bounds: {x, y, width, height} in screen points */
  private getWindowBounds(): { x: number; y: number; width: number; height: number } {
    try {
      const result = execSync(`osascript -e '
tell application "System Events"
    tell process "Simulator"
        set winPos to position of window 1
        set winSize to size of window 1
        return (item 1 of winPos as text) & "," & (item 2 of winPos as text) & "," & (item 1 of winSize as text) & "," & (item 2 of winSize as text)
    end tell
end tell'`, { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      const [x, y, width, height] = result.split(',').map(Number);
      return { x, y, width, height };
    } catch {
      throw new Error('Cannot get Simulator window bounds. Is Simulator.app running?');
    }
  }

  /** Get the device logical size (points) from device type identifier */
  private getDeviceLogicalSize(): { width: number; height: number } {
    const deviceType = this.getDeviceType();
    for (const [key, size] of Object.entries(DEVICE_LOGICAL_SIZES)) {
      if (deviceType.includes(key)) return size;
    }
    return { width: 393, height: 852 }; // default iPhone Pro
  }

  /** Get the device type identifier for the current device */
  private getDeviceType(): string {
    try {
      const info = this.simctl('list devices -j');
      const parsed = JSON.parse(info);
      for (const runtime of Object.values(parsed.devices) as any[][]) {
        for (const dev of runtime) {
          if (dev.udid === this.deviceId || (this.deviceId === 'booted' && dev.state === 'Booted')) {
            return dev.deviceTypeIdentifier ?? '';
          }
        }
      }
    } catch { /* fallback */ }
    return '';
  }

  /**
   * Convert device physical-pixel coordinates to macOS screen points.
   * 1. physicalPx → logicalPt (divide by density)
   * 2. logicalPt → screenPt (scale by viewport ratio + window offset)
   */
  private deviceToScreen(devX: number, devY: number): { x: number; y: number } {
    const density = this.getDensity();
    const logX = devX / density;
    const logY = devY / density;

    const win = this.getWindowBounds();
    const devLogical = this.getDeviceLogicalSize();

    const vpW = win.width;
    const vpH = win.height - TITLEBAR_HEIGHT;

    const scaleX = vpW / devLogical.width;
    const scaleY = vpH / devLogical.height;

    return {
      x: Math.round(win.x + logX * scaleX),
      y: Math.round(win.y + TITLEBAR_HEIGHT + logY * scaleY),
    };
  }

  /** Check if cliclick is available */
  private hasCliclick(): boolean {
    try {
      execSync('which cliclick', { encoding: 'utf8', timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'] });
      return true;
    } catch { return false; }
  }

  tap(x: number, y: number): void {
    if (this.hasCliclick()) {
      const screen = this.deviceToScreen(x, y);
      execSync(`cliclick c:${screen.x},${screen.y}`, {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return;
    }
    throw new Error('Cannot tap on iOS simulator. Install cliclick: brew install cliclick');
  }

  swipe(x1: number, y1: number, x2: number, y2: number, durationMs: number): void {
    if (this.hasCliclick()) {
      const start = this.deviceToScreen(x1, y1);
      const end = this.deviceToScreen(x2, y2);
      const wait = Math.max(20, Math.round(durationMs / 4));
      execSync(`cliclick dd:${start.x},${start.y} w:${wait} m:${end.x},${end.y} w:${wait} du:${end.x},${end.y}`, {
        encoding: 'utf8',
        timeout: durationMs + 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return;
    }
    throw new Error('Cannot swipe on iOS simulator. Install cliclick: brew install cliclick');
  }

  keyevent(key: 'back' | 'home'): void {
    if (key === 'home') {
      // Shift+Cmd+H triggers the Simulator home action
      execSync(`osascript -e 'tell application "System Events" to keystroke "h" using {shift down, command down}'`, {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } else {
      // iOS has no back button — simulate swipe from left edge
      const screen = this.getScreenSize();
      this.swipe(5, screen.height / 2, screen.width / 2, screen.height / 2, 300);
    }
  }

  screenshot(): Buffer {
    const tmpPath = `/tmp/agent-flutter-ios-screenshot-${Date.now()}.png`;
    this.simctl(`io ${this.deviceId} screenshot ${tmpPath}`);
    const buf = readFileSync(tmpPath);
    try { unlinkSync(tmpPath); } catch { /* cleanup */ }
    return buf;
  }

  getScreenSize(): ScreenSize {
    const deviceType = this.getDeviceType();
    // Physical pixel resolutions (width x height)
    const sizes: [string[], ScreenSize][] = [
      [['iPhone-17-Pro-Max', 'iPhone-16-Pro-Max', 'iPhone-15-Pro-Max'], { width: 1290, height: 2796 }],
      [['iPhone-17-Pro', 'iPhone-16-Pro', 'iPhone-15-Pro'], { width: 1179, height: 2556 }],
      [['iPhone-17', 'iPhone-16', 'iPhone-15'], { width: 1170, height: 2532 }],
      [['iPhone-SE'], { width: 750, height: 1334 }],
      [['iPad-Pro-13'], { width: 2048, height: 2732 }],
      [['iPad-Pro-11', 'iPad-Air'], { width: 1668, height: 2388 }],
    ];
    for (const [keys, size] of sizes) {
      if (keys.some((k) => deviceType.includes(k))) return size;
    }
    return { width: 1179, height: 2556 };
  }

  getDensity(): number {
    const dt = this.getDeviceType();
    if (dt.includes('iPhone-SE') || dt.includes('iPhone-8')) return 2.0;
    if (dt.includes('iPad-mini') || dt.includes('iPad-Air-2')) return 2.0;
    return 3.0;
  }

  ensureAccessibility(): void {
    // iOS VoiceOver: not needed — Flutter generates semantics on iOS by default.
  }

  dumpText(): TextEntry[] {
    // UIAutomator is Android-only. iOS accessibility text extraction
    // would require XCUITest or accessibility APIs (future phase).
    return [];
  }

  detectVmServiceUri(): string | null {
    // On iOS simulator, VM Service URI comes from flutter run stdout
    // Check AGENT_FLUTTER_LOG first, then try simctl spawn log
    // The host URI is directly accessible (simulator shares host network)
    return null; // Handled by auto-detect.ts via AGENT_FLUTTER_LOG
  }

  portForward(_port: number): void {
    // iOS simulator shares host network — no port forwarding needed
  }

  detectDialog(): DialogInfo {
    // iOS permission dialogs appear as system alerts.
    // simctl doesn't have a direct way to detect them, but we can check
    // if the Simulator's accessibility tree has an alert element.
    try {
      const result = execSync(`osascript -e '
tell application "System Events"
    tell process "Simulator"
        if exists sheet 1 of window 1 then
            return "sheet"
        end if
        if exists (first UI element of window 1 whose role is "AXSheet") then
            return "alert"
        end if
    end tell
end tell
return "none"'`, { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      if (result === 'sheet' || result === 'alert') {
        return { present: true, window: `iOS ${result}` };
      }
    } catch { /* detection failed */ }
    return { present: false, window: 'n/a (iOS)' };
  }

  dismissDialog(): boolean {
    // Try to dismiss iOS system alerts by clicking the "Allow" or "OK" button
    // via accessibility, or fall back to tapping common button positions.
    try {
      const result = execSync(`osascript -e '
tell application "System Events"
    tell process "Simulator"
        tell window 1
            -- Try to find and click "Allow" or "OK" buttons in alerts
            set foundBtn to false
            repeat with elem in (every button)
                set btnTitle to title of elem
                if btnTitle is "Allow" or btnTitle is "OK" or btnTitle is "Allow While Using App" or btnTitle is "Continue" then
                    click elem
                    set foundBtn to true
                    exit repeat
                end if
            end repeat
            return foundBtn as text
        end tell
    end tell
end tell'`, { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      return result === 'true';
    } catch {
      return false;
    }
  }

  checkToolInstalled(): ToolCheck {
    try {
      execSync('xcrun simctl help', { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
    } catch {
      return { ok: false, message: 'xcrun simctl not found. Install Xcode and Command Line Tools' };
    }
    const hasCli = this.hasCliclick();
    const msg = hasCli
      ? 'Xcode Simulator tools + cliclick installed'
      : 'Xcode Simulator tools installed (cliclick missing — native tap/swipe unavailable, install with: brew install cliclick)';
    return { ok: true, message: msg };
  }

  listDevices(): string[] {
    try {
      const output = this.simctl('list devices -j');
      const parsed = JSON.parse(output);
      const devices: string[] = [];
      for (const runtime of Object.values(parsed.devices) as any[][]) {
        for (const dev of runtime) {
          if (dev.state === 'Booted') {
            devices.push(dev.udid);
          }
        }
      }
      return devices;
    } catch {
      return [];
    }
  }
}
