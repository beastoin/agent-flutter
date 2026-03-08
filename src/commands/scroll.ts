/**
 * scroll @ref|up|down|left|right [amount] [--dry-run] — Scroll element into view or page scroll via ADB.
 */
import { execSync } from 'node:child_process';
import { VmServiceClient } from '../vm-client.ts';
import { loadSession, resolveRef } from '../session.ts';
import { AgentFlutterError, ErrorCodes } from '../errors.ts';

const HELP = `Usage: agent-flutter scroll <target>

  scroll @ref              Scroll element into view via Marionette
  scroll down [amount]     Scroll down via ADB (amount: multiplier, default 1)
  scroll up [amount]       Scroll up via ADB
  scroll left [amount]     Scroll left via ADB
  scroll right [amount]    Scroll right via ADB

Options:
  --dry-run  Show intended action without executing`;

const SWIPE_COORDS: Record<string, [number, number, number, number]> = {
  down:  [540, 1500, 540, 500],
  up:    [540, 500, 540, 1500],
  left:  [900, 960, 100, 960],
  right: [100, 960, 900, 960],
};

export async function scrollCommand(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const isDryRun = args.includes('--dry-run') || process.env.AGENT_FLUTTER_DRY_RUN === '1';
  const positionals = args.filter((a) => a !== '--dry-run');

  if (positionals.length < 1) {
    throw new AgentFlutterError(ErrorCodes.INVALID_ARGS, 'Usage: agent-flutter scroll <@ref|up|down|left|right>');
  }

  const target = positionals[0];
  const deviceId = process.env.AGENT_FLUTTER_DEVICE ?? 'emulator-5554';

  // Direction-based ADB scroll
  if (SWIPE_COORDS[target]) {
    if (isDryRun) {
      console.log(JSON.stringify({ dryRun: true, command: 'scroll', direction: target, device: deviceId }));
      return;
    }
    const amount = positionals[1] ? parseFloat(positionals[1]) : 1;
    const [x1, y1, x2, y2] = SWIPE_COORDS[target];
    const dx = (x2 - x1) * amount;
    const dy = (y2 - y1) * amount;
    execSync(`adb -s ${deviceId} shell input swipe ${x1} ${y1} ${Math.round(x1 + dx)} ${Math.round(y1 + dy)} 300`, {
      timeout: 5000,
    });
    console.log(`Scrolled ${target}`);
    return;
  }

  // @ref-based Marionette scroll
  const session = loadSession();
  if (!session) throw new AgentFlutterError(ErrorCodes.NOT_CONNECTED, 'Not connected', 'Run: agent-flutter connect');

  const el = resolveRef(session, target);
  if (!el) throw new AgentFlutterError(ErrorCodes.ELEMENT_NOT_FOUND, `Ref not found: ${target}`, 'Run: agent-flutter snapshot');

  if (isDryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      command: 'scroll',
      target: `@${el.ref}`,
      resolved: { type: el.type, key: el.key ?? null },
    }));
    return;
  }

  const client = new VmServiceClient();
  await client.connect(session.vmServiceUri);
  try {
    if (el.key) {
      await client.scrollTo({ type: 'Key', keyValue: el.key });
    } else if (el.text) {
      await client.scrollTo({ type: 'Text', text: el.text });
    } else {
      const cx = el.bounds.x + el.bounds.width / 2;
      const cy = el.bounds.y + el.bounds.height / 2;
      await client.scrollTo({ type: 'Coordinates', x: cx, y: cy });
    }
    console.log(`Scrolled to @${el.ref}`);
  } finally {
    await client.disconnect();
  }
}
