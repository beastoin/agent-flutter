/**
 * tap <x> <y> | tap @ref — Tap at coordinates via ADB input tap.
 * Bypasses Marionette entirely — works even when refs are stale.
 */
import { execSync } from 'node:child_process';
import { loadSession, resolveRef } from '../session.ts';
import { AgentFlutterError, ErrorCodes } from '../errors.ts';

const HELP = `Usage: agent-flutter tap <x> <y>
       agent-flutter tap @ref

  Tap at absolute screen coordinates via ADB.
  Bypasses Marionette — works even when snapshot refs are stale.

  <x> <y>  Physical pixel coordinates
  @ref     Element reference — taps at center of bounds

Options:
  --dry-run  Show coordinates without tapping`;

export async function tapCommand(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const isDryRun = args.includes('--dry-run') || process.env.AGENT_FLUTTER_DRY_RUN === '1';
  const positionals = args.filter(a => a !== '--dry-run');

  if (positionals.length < 1) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, 'Usage: agent-flutter tap <x> <y> | tap @ref');
  }

  const device = process.env.AGENT_FLUTTER_DEVICE ?? 'emulator-5554';
  let x: number;
  let y: number;
  let method: 'coordinates' | 'ref';

  // Check if first arg is a ref (@eN or eN)
  const refPattern = /^@?e\d+$/;
  if (refPattern.test(positionals[0])) {
    // Ref-based tap
    const session = loadSession();
    if (!session) {
      throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, 'Not connected', 'Run: agent-flutter connect');
    }

    const el = resolveRef(session, positionals[0]);
    if (!el) {
      throw new AgentFlutterError(ErrorCodes.ELEMENT_NOT_FOUND, `Ref not found: ${positionals[0]}`, 'Run: agent-flutter snapshot');
    }

    if (!el.bounds) {
      throw new AgentFlutterError(ErrorCodes.COMMAND_FAILED, `No bounds for ${positionals[0]}`, 'Element must have bounds for tap');
    }

    // Compute center in logical pixels
    const logicalX = el.bounds.x + el.bounds.width / 2;
    const logicalY = el.bounds.y + el.bounds.height / 2;

    // Convert to physical pixels using device density
    const density = getDeviceDensity(device);
    x = Math.round(logicalX * density);
    y = Math.round(logicalY * density);
    method = 'ref';
  } else {
    // Coordinate-based tap
    if (positionals.length < 2) {
      throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, 'Usage: agent-flutter tap <x> <y>');
    }

    x = parseInt(positionals[0], 10);
    y = parseInt(positionals[1], 10);

    if (isNaN(x) || isNaN(y)) {
      throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Invalid coordinates: ${positionals[0]} ${positionals[1]}`);
    }

    method = 'coordinates';
  }

  if (isDryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      command: 'tap',
      tapped: { x, y },
      method,
    }));
    return;
  }

  // Execute ADB tap
  try {
    execSync(`adb -s ${device} shell input tap ${x} ${y}`, {
      encoding: 'utf8',
      timeout: 5000,
    });

    console.log(JSON.stringify({
      tapped: { x, y },
      method,
    }));
  } catch {
    throw new AgentFlutterError(
      ErrorCodes.COMMAND_FAILED,
      `Failed to tap at ${x},${y}`,
      'Check ADB connection',
    );
  }
}

function getDeviceDensity(device: string): number {
  try {
    const output = execSync(`adb -s ${device} shell wm density`, {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    // Output: "Physical density: 420" or "Override density: 320"
    const match = output.match(/density:\s*(\d+)/);
    if (match) {
      // Convert dpi to device pixel ratio (160 dpi = 1x)
      return parseInt(match[1], 10) / 160;
    }
  } catch {
    // fallback
  }
  // Default to 2.625x (common for 420dpi devices like Pixel 7a)
  return 2.625;
}
