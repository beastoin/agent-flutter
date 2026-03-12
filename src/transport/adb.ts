/**
 * AdbTransport — Android device transport via ADB.
 * Extracted from existing command implementations.
 */
import { execSync } from 'node:child_process';
import type { DeviceTransport, ScreenSize, DialogInfo, ToolCheck, TextEntry } from './types.ts';
import { parseUiAutomatorXml } from '../text-parser.ts';

export class AdbTransport implements DeviceTransport {
  readonly platform = 'android' as const;
  readonly deviceId: string;

  constructor(deviceId: string) {
    this.deviceId = deviceId;
  }

  private exec(cmd: string, opts?: { maxBuffer?: number; timeout?: number }): string {
    return execSync(`adb -s ${this.deviceId} ${cmd}`, {
      encoding: 'utf8',
      timeout: opts?.timeout ?? 5000,
      maxBuffer: opts?.maxBuffer,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  }

  private execRaw(cmd: string, opts?: { maxBuffer?: number; timeout?: number }): Buffer {
    return execSync(`adb -s ${this.deviceId} ${cmd}`, {
      timeout: opts?.timeout ?? 10000,
      maxBuffer: opts?.maxBuffer ?? 10 * 1024 * 1024,
    });
  }

  tap(x: number, y: number): void {
    this.exec(`shell input tap ${x} ${y}`);
  }

  swipe(x1: number, y1: number, x2: number, y2: number, durationMs: number): void {
    this.exec(`shell input swipe ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x2)} ${Math.round(y2)} ${durationMs}`);
  }

  keyevent(key: 'back' | 'home'): void {
    const code = key === 'back' ? 4 : 3;
    this.exec(`shell input keyevent ${code}`);
  }

  screenshot(): Buffer {
    return this.execRaw('shell screencap -p');
  }

  getScreenSize(): ScreenSize {
    try {
      const output = this.exec('shell wm size');
      // Output: "Physical size: 1080x1920" or "Override size: 1080x2400"
      const match = output.match(/size:\s*(\d+)x(\d+)/);
      if (match) {
        return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
      }
    } catch {
      // fallback
    }
    return { width: 1080, height: 1920 };
  }

  getDensity(): number {
    try {
      const output = this.exec('shell wm density');
      const match = output.match(/density:\s*(\d+)/);
      if (match) {
        return parseInt(match[1], 10) / 160;
      }
    } catch {
      // fallback
    }
    return 2.625;
  }

  ensureAccessibility(): void {
    // Flutter only generates the Semantics tree when an accessibility service
    // is active (TalkBack on Android). Without it, debugDumpSemanticsTree
    // returns "Semantics not generated". Enable once — idempotent.
    try {
      const current = this.exec('shell settings get secure accessibility_enabled', { timeout: 3000 });
      if (current.trim() === '1') return; // Already enabled
    } catch {
      // Can't check — try to enable anyway
    }
    try {
      this.exec(
        'shell settings put secure enabled_accessibility_services com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService',
        { timeout: 5000 },
      );
      this.exec('shell settings put secure accessibility_enabled 1', { timeout: 3000 });
      // Brief wait for Flutter to pick up the accessibility change and build semantics tree
      this.exec('shell sleep 0.5', { timeout: 3000 });
    } catch {
      // Best-effort — semantics may still work if accessibility was already enabled
    }
  }

  dumpText(): TextEntry[] {
    // UIAutomator's waitForIdle() fails on pages with continuous animations
    // (loading spinners, shimmer effects, pulsing buttons). Retry up to 3 times
    // with brief pauses to catch moments when the app settles between frames.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        this.exec('shell uiautomator dump /sdcard/window_dump.xml', { timeout: 10000 });
        const xml = this.exec('shell cat /sdcard/window_dump.xml', { timeout: 5000, maxBuffer: 5 * 1024 * 1024 });
        const entries = parseUiAutomatorXml(xml);
        if (entries.length > 0) return entries;
        // Got empty dump — retry after brief pause
      } catch {
        // "ERROR: could not get idle state" — retry after pause
      }
      if (attempt < 2) {
        try { this.exec('shell sleep 0.5', { timeout: 3000 }); } catch { /* ignore */ }
      }
    }
    return [];
  }

  detectVmServiceUri(): string | null {
    try {
      const logcat = this.exec('logcat -d -s flutter', {
        timeout: 10000,
        maxBuffer: 10 * 1024 * 1024,
      });
      const matches = logcat.match(/http:\/\/127\.0\.0\.1:\d+\/[^/]+\//g);
      if (!matches || matches.length === 0) return null;
      const unique = [...new Set(matches)].reverse();
      return unique[0].replace('http://', 'ws://') + 'ws';
    } catch {
      return null;
    }
  }

  portForward(port: number): void {
    try {
      this.exec(`forward tcp:${port} tcp:${port}`);
    } catch {
      // may already exist
    }
  }

  detectDialog(): DialogInfo {
    try {
      const output = this.exec('shell dumpsys window displays');
      const focusMatch = output.match(/mCurrentFocus=Window\{[^}]*\s+(\S+)\}/);
      const window = focusMatch?.[1] ?? 'unknown';

      const safeWindows = ['StatusBar', 'NavigationBar', 'InputMethod'];
      if (safeWindows.some(w => window.includes(w))) {
        return { present: false, window };
      }

      const dialogIndicators = [
        'com.google.android.gms',
        'PermissionController',
        'com.android.systemui',
        'com.google.android.permissioncontroller',
        'AlertDialog',
        'Chooser',
      ];

      const isDialog = dialogIndicators.some(d => window.includes(d));
      return { present: isDialog, window };
    } catch {
      return { present: false, window: 'error' };
    }
  }

  dismissDialog(): boolean {
    const info = this.detectDialog();
    if (!info.present) return false;
    this.keyevent('back');
    return true;
  }

  checkToolInstalled(): ToolCheck {
    try {
      execSync('adb version', { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
      return { ok: true, message: 'ADB is installed' };
    } catch {
      return { ok: false, message: 'ADB not found. Install Android SDK Platform Tools and add to PATH' };
    }
  }

  listDevices(): string[] {
    try {
      const output = execSync('adb devices', { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
      return output.trim().split('\n').slice(1)
        .filter(l => l.includes('\tdevice'))
        .map(l => l.split('\t')[0]);
    } catch {
      return [];
    }
  }
}
