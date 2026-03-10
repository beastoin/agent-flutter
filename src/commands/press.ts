/**
 * press @ref | press <x> <y> | press @ref --adb — Tap element.
 *
 * Three modes:
 *   @ref           Marionette tap via VM Service (default)
 *   <x> <y>        ADB coordinate tap (physical pixels)
 *   @ref --adb     ADB tap at ref center (bypasses Marionette)
 */
import { execSync } from 'node:child_process';
import { VmServiceClient } from '../vm-client.ts';
import { loadSession, resolveRef } from '../session.ts';
import { AgentFlutterError, ErrorCodes } from '../errors.ts';

const HELP = `Usage: agent-flutter press @ref
       agent-flutter press <x> <y>
       agent-flutter press @ref --adb

  Tap element by ref (Marionette), coordinates (ADB), or ref via ADB.

  @ref       Element reference from snapshot (e.g. @e3) — uses Marionette
  <x> <y>    Physical pixel coordinates — uses ADB input tap
  --adb      Force ADB tap instead of Marionette (useful when refs are stale)

Options:
  --dry-run  Resolve target without executing`;

export async function pressCommand(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const isDryRun = args.includes('--dry-run') || process.env.AGENT_FLUTTER_DRY_RUN === '1';
  const useAdb = args.includes('--adb');
  const positionals = args.filter((a) => a !== '--dry-run' && a !== '--adb');

  if (positionals.length < 1) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, 'Usage: agent-flutter press @ref | press <x> <y>');
  }

  // Detect mode: coordinates (two numbers) vs ref
  const isCoordinateMode = positionals.length >= 2 &&
    /^\d+$/.test(positionals[0]) && /^\d+$/.test(positionals[1]);

  if (isCoordinateMode) {
    await pressCoordinates(positionals, isDryRun);
  } else if (useAdb) {
    await pressAdbRef(positionals, isDryRun);
  } else {
    await pressMarionette(positionals, isDryRun);
  }
}

/** Marionette tap via VM Service (existing behavior) */
async function pressMarionette(positionals: string[], isDryRun: boolean): Promise<void> {
  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, 'Not connected', 'Run: agent-flutter connect');

  const el = resolveRef(session, positionals[0]);
  if (!el) throw new AgentFlutterError(ErrorCodes.ELEMENT_NOT_FOUND, `Ref not found: ${positionals[0]}`, 'Run: agent-flutter snapshot');

  const resolveMethod = el.key ? 'Key' : el.text ? 'Text' : 'Coordinates';

  if (isDryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      command: 'press',
      target: `@${el.ref}`,
      resolved: { type: el.type, key: el.key ?? null, method: resolveMethod },
      method: 'marionette',
    }));
    return;
  }

  const client = new VmServiceClient();
  await client.connect(session.vmServiceUri);
  try {
    if (el.key) {
      await client.tap({ type: 'Key', keyValue: el.key });
    } else if (el.text) {
      await client.tap({ type: 'Text', text: el.text });
    } else {
      const cx = el.bounds.x + el.bounds.width / 2;
      const cy = el.bounds.y + el.bounds.height / 2;
      await client.tap({ type: 'Coordinates', x: cx, y: cy });
    }
    console.log(JSON.stringify({
      pressed: `@${el.ref}`,
      method: 'marionette',
    }));
  } finally {
    await client.disconnect();
  }
}

/** ADB tap at physical pixel coordinates */
async function pressCoordinates(positionals: string[], isDryRun: boolean): Promise<void> {
  const x = parseInt(positionals[0], 10);
  const y = parseInt(positionals[1], 10);

  if (isNaN(x) || isNaN(y)) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, `Invalid coordinates: ${positionals[0]} ${positionals[1]}`);
  }

  const device = process.env.AGENT_FLUTTER_DEVICE ?? 'emulator-5554';

  if (isDryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      command: 'press',
      tapped: { x, y },
      method: 'coordinates',
    }));
    return;
  }

  adbTap(device, x, y);
  console.log(JSON.stringify({
    pressed: { x, y },
    method: 'coordinates',
  }));
}

/** ADB tap at ref center (bypasses Marionette, uses bounds from session) */
async function pressAdbRef(positionals: string[], isDryRun: boolean): Promise<void> {
  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, 'Not connected', 'Run: agent-flutter connect');

  const el = resolveRef(session, positionals[0]);
  if (!el) throw new AgentFlutterError(ErrorCodes.ELEMENT_NOT_FOUND, `Ref not found: ${positionals[0]}`, 'Run: agent-flutter snapshot');

  if (!el.bounds) {
    throw new AgentFlutterError(ErrorCodes.COMMAND_FAILED, `No bounds for ${positionals[0]}`, 'Element must have bounds for ADB tap');
  }

  const device = process.env.AGENT_FLUTTER_DEVICE ?? 'emulator-5554';

  // Compute center in logical pixels, convert to physical
  const logicalX = el.bounds.x + el.bounds.width / 2;
  const logicalY = el.bounds.y + el.bounds.height / 2;
  const density = getDeviceDensity(device);
  const x = Math.round(logicalX * density);
  const y = Math.round(logicalY * density);

  if (isDryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      command: 'press',
      target: `@${el.ref}`,
      tapped: { x, y },
      method: 'adb-ref',
    }));
    return;
  }

  adbTap(device, x, y);
  console.log(JSON.stringify({
    pressed: `@${el.ref}`,
    tapped: { x, y },
    method: 'adb-ref',
  }));
}

function adbTap(device: string, x: number, y: number): void {
  try {
    execSync(`adb -s ${device} shell input tap ${x} ${y}`, {
      encoding: 'utf8',
      timeout: 5000,
    });
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
    const match = output.match(/density:\s*(\d+)/);
    if (match) {
      return parseInt(match[1], 10) / 160;
    }
  } catch {
    // fallback
  }
  return 2.625;
}
