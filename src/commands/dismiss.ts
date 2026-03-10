/**
 * dismiss [--check] — Dismiss Android system dialog via ADB.
 */
import { execSync } from 'node:child_process';
import { AgentFlutterError, ErrorCodes } from '../errors.ts';

const HELP = `Usage: agent-flutter dismiss [--check]

  Dismiss the topmost Android system dialog via ADB.
  Detects if a non-app window is focused (system dialog, permissions, etc.)
  and sends BACK to dismiss it.

Options:
  --check  Check if a dialog is present without dismissing (exit 0=yes, 1=no)`;

export async function dismissCommand(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const checkOnly = args.includes('--check');
  const device = process.env.AGENT_FLUTTER_DEVICE ?? 'emulator-5554';

  const dialogInfo = detectDialog(device);

  if (checkOnly) {
    console.log(JSON.stringify({
      dialogPresent: dialogInfo.present,
      window: dialogInfo.window,
    }));
    if (!dialogInfo.present) {
      process.exitCode = 1;
    }
    return;
  }

  if (!dialogInfo.present) {
    console.log(JSON.stringify({
      dismissed: false,
      reason: 'no dialog detected',
      window: dialogInfo.window,
    }));
    return;
  }

  // Send BACK to dismiss the dialog
  try {
    adb(device, 'shell input keyevent 4');
    console.log(JSON.stringify({
      dismissed: true,
      window: dialogInfo.window,
    }));
  } catch {
    throw new AgentFlutterError(
      ErrorCodes.COMMAND_FAILED,
      'Failed to dismiss dialog',
      'Check ADB connection',
    );
  }
}

interface DialogInfo {
  present: boolean;
  window: string;
}

function detectDialog(device: string): DialogInfo {
  try {
    const output = adb(device, 'shell dumpsys window displays');
    // Look for mCurrentFocus or mFocusedWindow
    const focusMatch = output.match(/mCurrentFocus=Window\{[^}]*\s+(\S+)\}/);
    const window = focusMatch?.[1] ?? 'unknown';

    // Known non-dialog windows that are fine
    const safeWindows = ['StatusBar', 'NavigationBar', 'InputMethod'];
    if (safeWindows.some(w => window.includes(w))) {
      return { present: false, window };
    }

    // Known system dialog indicators
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

function adb(device: string, cmd: string): string {
  return execSync(`adb -s ${device} ${cmd}`, {
    encoding: 'utf8',
    timeout: 5000,
  }).trim();
}
