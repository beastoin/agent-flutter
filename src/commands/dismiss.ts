/**
 * dismiss [--check] — Dismiss system dialog (Android via ADB, no-op on iOS).
 */
import { resolveTransport } from '../transport/index.ts';
import { AgentFlutterError, ErrorCodes } from '../errors.ts';

const HELP = `Usage: agent-flutter dismiss [--check]

  Dismiss the topmost system dialog.
  On Android: detects non-app window and sends BACK.
  On iOS: not applicable (iOS handles dialogs differently).

Options:
  --check  Check if a dialog is present without dismissing (exit 0=yes, 1=no)`;

export async function dismissCommand(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const checkOnly = args.includes('--check');
  const transport = resolveTransport();

  const dialogInfo = transport.detectDialog();

  if (checkOnly) {
    console.log(JSON.stringify({
      dialogPresent: dialogInfo.present,
      window: dialogInfo.window,
      platform: transport.platform,
    }));
    if (!dialogInfo.present) {
      process.exitCode = 1;
    }
    return;
  }

  if (!dialogInfo.present) {
    console.log(JSON.stringify({
      dismissed: false,
      reason: transport.platform === 'ios' ? 'not supported on iOS' : 'no dialog detected',
      window: dialogInfo.window,
      platform: transport.platform,
    }));
    return;
  }

  // Dismiss
  const dismissed = transport.dismissDialog();
  if (dismissed) {
    console.log(JSON.stringify({
      dismissed: true,
      window: dialogInfo.window,
      platform: transport.platform,
    }));
  } else {
    throw new AgentFlutterError(
      ErrorCodes.COMMAND_FAILED,
      'Failed to dismiss dialog',
      'Check device connection',
    );
  }
}
