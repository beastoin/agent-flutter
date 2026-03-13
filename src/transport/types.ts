/**
 * DeviceTransport — platform abstraction for device interactions.
 * Implementations: AdbTransport (Android), IosSimTransport (iOS Simulator).
 */

export interface ScreenSize {
  width: number;
  height: number;
}

export interface DialogInfo {
  present: boolean;
  window: string;
}

export interface ToolCheck {
  ok: boolean;
  message: string;
}

export interface TextEntry {
  text: string;
  source: 'text' | 'content-desc';
  class: string;
  bounds: [number, number, number, number];
}

export interface DeviceTransport {
  readonly platform: 'android' | 'ios';
  readonly deviceId: string;

  // Input
  tap(x: number, y: number): void;
  swipe(x1: number, y1: number, x2: number, y2: number, durationMs: number): void;
  keyevent(key: 'back' | 'home'): void;
  inputText(text: string): void;

  // Query
  screenshot(): Buffer;
  getScreenSize(): ScreenSize;
  getDensity(): number;

  // Text extraction (accessibility layer)
  dumpText(): TextEntry[];
  ensureAccessibility(): void;

  // VM Service discovery
  detectVmServiceUri(): string | null;
  portForward(port: number): void;

  // Dialog handling
  detectDialog(): DialogInfo;
  dismissDialog(): boolean;

  // Doctor checks
  checkToolInstalled(): ToolCheck;
  listDevices(): string[];
}
