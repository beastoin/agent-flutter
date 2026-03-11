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

export interface DeviceTransport {
  readonly platform: 'android' | 'ios';
  readonly deviceId: string;

  // Input
  tap(x: number, y: number): void;
  swipe(x1: number, y1: number, x2: number, y2: number, durationMs: number): void;
  keyevent(key: 'back' | 'home'): void;

  // Query
  screenshot(): Buffer;
  getScreenSize(): ScreenSize;
  getDensity(): number;

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
